/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { WikiChannel } from '@/constants/channels';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { workflowTiddlerTagName } from '@services/wiki/plugin/nofloWorkflow/constants';
import { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ITiddlerFields } from 'tiddlywiki';
import { IWorkflowListItem } from './WorkflowList';

export function useAvailableFilterTags(workspacesList: IWorkspaceWithMetadata[] | undefined) {
  const [tagsByWorkspace, setTagsByWorkspace] = useState<Record<string, string[]>>({});
  const initialTagsByWorkspace = usePromiseValue<Record<string, string[]>>(
    async () => {
      const tasks = workspacesList?.map(async (workspace) => {
        try {
          const tags = await window.service.wiki.wikiOperation(
            WikiChannel.runFilter,
            workspace.id,
            // get workflow tiddlers' tags
            `[all[tiddlers+shadows]tag[${workflowTiddlerTagName}]tags[]!is[system]]`,
          );
          return tags ?? [];
        } catch {
          // if workspace is hibernated or is subwiki, it will throw error, just return empty tags array
          return [];
        }
      });
      const tagsByWorkspace = await Promise.all(tasks ?? []);
      return workspacesList?.reduce((accumulator: Record<string, string[]>, workspace, index) => {
        accumulator[workspace.id] = tagsByWorkspace[index];
        return accumulator;
      }, {}) ?? {};
    },
    {},
    [workspacesList],
  )!;
  // loading TagsByWorkspace using filter expression is expensive, so we only do this on initial load. Later just update&use local state value
  useEffect(() => {
    setTagsByWorkspace(initialTagsByWorkspace);
  }, [initialTagsByWorkspace]);
  const allTagsSet = useMemo(() => {
    const allTags = new Set<string>();
    for (const tags of Object.values(tagsByWorkspace)) {
      for (const tag of tags) {
        allTags.add(tag);
      }
    }
    return allTags;
  }, [tagsByWorkspace]);
  const allTags = useMemo(() => [...allTagsSet], [allTagsSet]);
  return [allTags, setTagsByWorkspace, allTagsSet, tagsByWorkspace] as const;
}

export interface IWorkflowTiddler extends ITiddlerFields {
  description: string;
  /**
   * The preview image of workflow. Can be added using $:/plugins/Gk0Wk/notionpage-covericon plugin
   * Will be the `image` field in IWorkflowListItem
   */
  ['page-cover']: string;
  type: 'application/json';
}

export function useWorkflowFromWiki(workspacesList: IWorkspaceWithMetadata[] | undefined) {
  const workflowItems = usePromiseValue<IWorkflowListItem[]>(
    async () => {
      const tasks = workspacesList?.map(async (workspace) => {
        try {
          const workflowTiddlers = await window.service.wiki.wikiOperation(
            WikiChannel.getTiddlersAsJson,
            workspace.id,
            `[all[tiddlers+shadows]tag[${workflowTiddlerTagName}]]`,
          );
          return (workflowTiddlers ?? []) as IWorkflowTiddler[];
        } catch {
          // if workspace is hibernated or is subwiki, it will throw error, just return empty workflows array
          return [];
        }
      });
      const workflowsByWorkspace = await Promise.all(tasks ?? []);
      return workspacesList?.map?.((workspace, workspaceIndex) => {
        const workflowTiddlersInWorkspace = workflowsByWorkspace[workspaceIndex];
        return workflowTiddlersInWorkspace.map((tiddler) => {
          const workflowItem: IWorkflowListItem = {
            id: `${workspace.id}:${tiddler.title}`,
            title: tiddler.title,
            graphJSONString: tiddler.text,
            description: tiddler.description,
            tags: tiddler.tags.filter(item => item !== workflowTiddlerTagName),
            workspaceID: workspace.id,
            image: tiddler['page-cover'],
            metadata: {
              workspace,
              tiddler,
            },
          };
          return workflowItem;
        });
      })?.flat?.() ?? [];
    },
    [],
    [workspacesList],
  )!;
  return workflowItems;
}

/**
 * CRUD and local state of workflows
 */
export function useWorkflows(workspacesList: IWorkspaceWithMetadata[] | undefined, setTagsByWorkspace: React.Dispatch<React.SetStateAction<Record<string, string[]>>>) {
  const [workflows, setWorkflows] = useState<IWorkflowListItem[]>([]);
  const initialWorkflows = useWorkflowFromWiki(workspacesList);
  // loading workflows using filter expression is expensive, so we only do this on initial load. Later just update&use local state value
  useEffect(() => {
    setWorkflows(initialWorkflows.sort(sortWorkflow));
  }, [initialWorkflows]);
  const onAddWorkflow = useCallback(async (newItem: IWorkflowListItem, oldItem?: IWorkflowListItem) => {
    await addWorkflowToWiki(newItem, oldItem);
    // can overwrite a old workflow with same title
    setWorkflows((workflows) => [...workflows.filter(item => item.title !== newItem.title), newItem].sort(sortWorkflow));
    // update tag list in the search region tags filter
    setTagsByWorkspace((previousTagsByWorkspace) => {
      // add newly appeared tags to local state
      const newTags = newItem.tags.filter((tag) => !previousTagsByWorkspace[newItem.workspaceID]?.includes(tag) && tag !== workflowTiddlerTagName);
      if (newTags.length === 0) return previousTagsByWorkspace;
      const previousTags = previousTagsByWorkspace[newItem.workspaceID] ?? [];
      return {
        ...previousTagsByWorkspace,
        [newItem.workspaceID]: [...previousTags, ...newTags],
      };
    });
  }, [setTagsByWorkspace, setWorkflows]);
  const onDeleteWorkflow = useCallback((item: IWorkflowListItem) => {
    // delete workflow from wiki
    window.service.wiki.wikiOperation(
      WikiChannel.deleteTiddler,
      item.workspaceID,
      item.title,
    );
    // delete workflow from local state
    setWorkflows((workflows) => workflows.filter(workflow => workflow.id !== item.id).sort(sortWorkflow));
  }, [setWorkflows]);

  return [workflows, onAddWorkflow, onDeleteWorkflow] as const;
}

export async function addWorkflowToWiki(newItem: IWorkflowListItem, oldItem?: IWorkflowListItem) {
  // FIXME: this won't resolve if user haven't click on wiki once, the browser view might not initialized (but why we can still read workflow list using filter??)
  await window.service.wiki.wikiOperation(
    WikiChannel.addTiddler,
    newItem.workspaceID,
    newItem.title,
    // Store the graph json on modify, or only save an initial value at this creation time
    newItem.graphJSONString || '{}',
    {
      type: 'application/json',
      tags: [...newItem.tags, workflowTiddlerTagName],
      description: newItem.description ?? '',
      'page-cover': newItem.image ?? '',
    } satisfies Omit<IWorkflowTiddler, 'text' | 'title'>,
    { withDate: true },
  );
  // we sort workflows using workflow.metadata.tiddler.modified, so we need to update it (side effect)
  if (newItem.metadata?.tiddler) {
    // @ts-expect-error Cannot assign to 'modified' because it is a read-only property.ts(2540)
    newItem.metadata.tiddler.modified = new Date();
  }
  // when change title, wiki requires delete old tiddler manually
  if (oldItem !== undefined && oldItem.title !== newItem.title) {
    window.service.wiki.wikiOperation(
      WikiChannel.deleteTiddler,
      oldItem.workspaceID,
      oldItem.title,
    );
  }
}

export function sortWorkflow(workflow1: IWorkflowListItem, workflow2: IWorkflowListItem) {
  return (workflow2.metadata?.tiddler?.modified ?? new Date()).getTime() - (workflow1.metadata?.tiddler?.modified ?? new Date()).getTime();
}
