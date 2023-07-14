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
          const workflowTiddlersJSONString = await window.service.wiki.wikiOperation(
            WikiChannel.getTiddlersAsJson,
            workspace.id,
            `[all[tiddlers+shadows]tag[${workflowTiddlerTagName}]]`,
          );
          return JSON.parse(workflowTiddlersJSONString ?? '[]') as IWorkflowTiddler[];
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
            description: tiddler.description,
            tags: tiddler.tags,
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

export function useWorkflows(workspacesList: IWorkspaceWithMetadata[] | undefined, setTagsByWorkspace: React.Dispatch<React.SetStateAction<Record<string, string[]>>>) {
  const [workflows, setWorkflows] = useState<IWorkflowListItem[]>([]);
  const initialWorkflows = useWorkflowFromWiki(workspacesList);
  // loading workflows using filter expression is expensive, so we only do this on initial load. Later just update&use local state value
  useEffect(() => {
    setWorkflows(initialWorkflows);
  }, [initialWorkflows]);
  const onAddWorkflow = useCallback(async (newItem: IWorkflowListItem) => {
    // add workflow to wiki
    await window.service.wiki.wikiOperation(
      WikiChannel.addTiddler,
      newItem.workspaceID,
      newItem.title,
      // only save an initial value at this creation time
      '{}',
      {
        type: 'application/json',
        tags: newItem.tags,
        description: newItem.description ?? '',
        'page-cover': newItem.image ?? '',
      } satisfies Omit<IWorkflowTiddler, 'text' | 'title'>,
      { withDate: true },
    );
    // can overwrite a old workflow with same title
    setWorkflows((workflows) => [...workflows.filter(item => item.title !== newItem.title), newItem]);
    // update tag list in the search region tags filter
    setTagsByWorkspace((previousTagsByWorkspace) => {
      const newTags = newItem.tags.filter((tag) => !previousTagsByWorkspace[newItem.workspaceID]?.includes(tag));
      if (newTags.length === 0) return previousTagsByWorkspace;
      const previousTags = previousTagsByWorkspace[newItem.workspaceID] ?? [];
      return {
        ...previousTagsByWorkspace,
        [newItem.workspaceID]: [...previousTags, ...newTags],
      };
    });
  }, [setTagsByWorkspace]);
  return [workflows, onAddWorkflow] as const;
}
