import { WikiChannel } from '@/constants/channels';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { AGENT_DEFINITION_TIDDLER_TAG_NAME } from '@services/workflow/constants';
import { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ITiddlerFields } from 'tiddlywiki';
import { IAgentListItem } from './AgentsList';

export function useAvailableFilterTags(workspacesList: IWorkspaceWithMetadata[] | undefined) {
  const [tagsByWorkspace, setTagsByWorkspace] = useState<Record<string, string[]>>({});
  const initialTagsByWorkspace = usePromiseValue<Record<string, string[]>>(
    async () => {
      const tasks = workspacesList?.map(async (workspace) => {
        try {
          const tags = await window.service.wiki.wikiOperationInServer(
            WikiChannel.runFilter,
            workspace.id,
            // get agent tiddlers' tags
            [`[all[tiddlers+shadows]tag[${AGENT_DEFINITION_TIDDLER_TAG_NAME}]tags[]!is[system]]`],
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

export interface IAgentTiddler extends ITiddlerFields {
  description: string;
  /**
   * The preview image of agent. Can be added using $:/plugins/Gk0Wk/notionpage-covericon plugin
   * Will be the `image` field in IAgentListItem
   */
  ['page-cover']: string;
  type: 'application/json';
}

export function useAgentFromWiki(workspacesList: IWorkspaceWithMetadata[] | undefined) {
  const agentItems = usePromiseValue<IAgentListItem[]>(
    async () => {
      const tasks = workspacesList?.map(async (workspace) => {
        try {
          const agentTiddlers = await window.service.wiki.wikiOperationInServer(
            WikiChannel.getTiddlersAsJson,
            workspace.id,
            [`[all[tiddlers+shadows]tag[${AGENT_DEFINITION_TIDDLER_TAG_NAME}]]`],
          );
          return (agentTiddlers ?? []) as IAgentTiddler[];
        } catch {
          // if workspace is hibernated or is subwiki, it will throw error, just return empty agents array
          return [];
        }
      });
      const agentsByWorkspace = await Promise.all(tasks ?? []);
      return workspacesList?.map((workspace, workspaceIndex) => {
        const agentTiddlersInWorkspace = agentsByWorkspace[workspaceIndex];
        return agentTiddlersInWorkspace.map((tiddler) => {
          const agentItem: IAgentListItem = {
            id: `${workspace.id}:${tiddler.title}`,
            title: tiddler.title,
            graphJSONString: tiddler.text,
            description: tiddler.description,
            tags: tiddler.tags.filter(item => item !== AGENT_DEFINITION_TIDDLER_TAG_NAME),
            workspaceID: workspace.id,
            image: tiddler['page-cover'],
            metadata: {
              workspace,
              tiddler,
            },
          };
          return agentItem;
        });
      }).flat() ?? [];
    },
    [],
    [workspacesList],
  )!;
  return agentItems;
}

/**
 * CRUD and local state of agents
 */
export function useAgents(workspacesList: IWorkspaceWithMetadata[] | undefined, setTagsByWorkspace: React.Dispatch<React.SetStateAction<Record<string, string[]>>>) {
  const [agents, setAgents] = useState<IAgentListItem[]>([]);
  const initialAgents = useAgentFromWiki(workspacesList);
  // loading agents using filter expression is expensive, so we only do this on initial load. Later just update&use local state value
  useEffect(() => {
    setAgents(initialAgents.sort(sortAgent));
  }, [initialAgents]);
  const onAddAgent = useCallback(async (newItem: IAgentListItem, oldItem?: IAgentListItem) => {
    await addAgentToWiki(newItem, oldItem);
    // can overwrite a old agent with same title
    setAgents((agents) => [...agents.filter(item => item.title !== newItem.title), newItem].sort(sortAgent));
    // update tag list in the search region tags filter
    setTagsByWorkspace((previousTagsByWorkspace) => {
      // add newly appeared tags to local state
      const newTags = newItem.tags.filter((tag) => !previousTagsByWorkspace[newItem.workspaceID].includes(tag) && tag !== AGENT_DEFINITION_TIDDLER_TAG_NAME);
      if (newTags.length === 0) return previousTagsByWorkspace;
      const previousTags = previousTagsByWorkspace[newItem.workspaceID] ?? [];
      return {
        ...previousTagsByWorkspace,
        [newItem.workspaceID]: [...previousTags, ...newTags],
      };
    });
  }, [setTagsByWorkspace]);
  const onDeleteAgent = useCallback(async (item: IAgentListItem) => {
    // delete agent from wiki
    await window.service.wiki.wikiOperationInServer(
      WikiChannel.deleteTiddler,
      item.workspaceID,
      [item.title],
    );
    // delete agent from local state
    setAgents((agents) => agents.filter(agent => agent.id !== item.id).sort(sortAgent));
  }, []);

  return [agents, onAddAgent, onDeleteAgent] as const;
}

export async function addAgentToWiki(newItem: IAgentListItem, oldItem?: IAgentListItem) {
  // FIXME: this won't resolve if user haven't click on wiki once, the browser view might not initialized (but why we can still read agent list using filter??)
  await window.service.wiki.wikiOperationInServer(
    WikiChannel.addTiddler,
    newItem.workspaceID,
    [
      newItem.title,
      // Store the graph json on modify, or only save an initial value at this creation time
      newItem.graphJSONString || '{}',
      JSON.stringify(
        {
          type: 'application/json',
          tags: [...newItem.tags, AGENT_DEFINITION_TIDDLER_TAG_NAME],
          description: newItem.description ?? '',
          'page-cover': newItem.image ?? '',
        } satisfies Omit<IAgentTiddler, 'text' | 'title'>,
      ),
      JSON.stringify({ withDate: true }),
    ],
  );
  // we sort agents using agent.metadata.tiddler.modified, so we need to update it (side effect)
  if (newItem.metadata?.tiddler) {
    // @ts-expect-error Cannot assign to 'modified' because it is a read-only property.ts(2540)
    newItem.metadata.tiddler.modified = new Date();
  }
  // when change title, wiki requires delete old tiddler manually
  if (oldItem !== undefined && oldItem.title !== newItem.title) {
    await window.service.wiki.wikiOperationInServer(
      WikiChannel.deleteTiddler,
      oldItem.workspaceID,
      [oldItem.title],
    );
  }
}

export function sortAgent(agent1: IAgentListItem, agent2: IAgentListItem) {
  return (agent2.metadata?.tiddler?.modified ?? new Date()).getTime() - (agent1.metadata?.tiddler?.modified ?? new Date()).getTime();
}
