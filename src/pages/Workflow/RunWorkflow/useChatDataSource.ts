import { WikiChannel } from '@/constants/channels';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { chatTiddlerTagName } from '@services/wiki/plugin/nofloWorkflow/constants';
import { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { useCallback, useEffect, useState } from 'react';
import type { ITiddlerFields } from 'tiddlywiki';
import { SingleChatState } from '../libs/ui/debugUIEffects/store';
import { useChatsStore } from './useChatsStore';

export interface IChatTiddler extends ITiddlerFields {
  description: string;
  ['page-cover']: string;
  type: 'application/json';
  /**
   * Which workflow creates this chat.
   */
  workflowID: string;
}

export interface IChatListItem {
  /**
   * Parsed JSON from chatJSONString, parsed when loaded to store. Not exist in the wiki.
   */
  chatJSON?: SingleChatState;
  /**
   * Serialized JSON of the SingleChatState.
   * We store the chat as a JSON tiddler in the wiki, and render the content i18nly from the JSON data.
   */
  chatJSONString?: string;
  description?: string;
  id: string;
  image?: string;
  metadata?: {
    tiddler: IChatTiddler;
    workspace: IWorkspaceWithMetadata;
  };
  tags: string[];
  title: string;
  workflowID: string;
  workspaceID: string;
}

/**
 * Get chats from the wiki, based on workflow ID.
 * @param workspacesList Workspaces that the user has access to, as data source.
 * @param workflowID The workflow ID that these chats were generated with.
 */
export function useChatsFromWiki(workspacesList: IWorkspaceWithMetadata[] | undefined, workflowID: string | undefined) {
  const chatItems = usePromiseValue<IChatListItem[]>(
    async () => {
      if (workflowID === undefined) return [];
      const tasks = workspacesList?.map(async (workspace) => {
        try {
          const chatTiddlers = await window.service.wiki.wikiOperation(
            WikiChannel.getTiddlersAsJson,
            workspace.id,
            `[all[tiddlers]tag[${chatTiddlerTagName}]field:workflowID[${workflowID}]]`,
          );
          return (chatTiddlers ?? []) as IChatTiddler[];
        } catch {
          return [];
        }
      });

      const chatsByWorkspace = await Promise.all(tasks ?? []);
      return workspacesList?.map?.((workspace, workspaceIndex) => {
        const chatTiddlersInWorkspace = chatsByWorkspace[workspaceIndex];
        return chatTiddlersInWorkspace.map((tiddler) => {
          const chatItem: IChatListItem = {
            id: `${workspace.id}:${tiddler.title}`,
            title: (tiddler.caption as string | undefined) ?? tiddler.title,
            chatJSONString: tiddler.text,
            chatJSON: JSON.parse(tiddler.text) as SingleChatState,
            description: tiddler.description,
            tags: tiddler.tags.filter(item => item !== chatTiddlerTagName),
            workspaceID: workspace.id,
            image: tiddler['page-cover'],
            workflowID: tiddler.workflowID,
            metadata: {
              workspace,
              tiddler,
            },
          };
          return chatItem;
        });
      })?.flat?.() ?? [];
    },
    [],
    [workspacesList, workflowID],
  )!;
  return chatItems;
}

export async function addChatToWiki(newItem: IChatListItem, oldItem?: IChatListItem) {
  await window.service.wiki.wikiOperation(
    WikiChannel.addTiddler,
    newItem.workspaceID,
    newItem.title,
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
    newItem.chatJSONString || '[]',
    {
      type: 'application/json',
      tags: [...newItem.tags, chatTiddlerTagName],
      description: newItem.description ?? '',
      'page-cover': newItem.image ?? '',
      workflowId: newItem.workflowID,
    },
    { withDate: true },
  );
  if (oldItem !== undefined) {
    window.service.wiki.wikiOperation(
      WikiChannel.deleteTiddler,
      oldItem.workspaceID,
      oldItem.title,
    );
  }
}

export function sortChat(a: IChatListItem, b: IChatListItem) {
  // @ts-expect-error The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.ts(2362)
  return b.metadata.tiddler.created - a.metadata.tiddler.created;
}

/**
 * Get chats related methods based on workflow ID.
 * @param workspacesList Workspaces that the user has access to, as data source.
 * @param workflowID The workflow ID that these chats were generated with.
 */
export function useChatDataSource(workspacesList: IWorkspaceWithMetadata[] | undefined, workflowID: string | undefined) {
  const [chats, setChats] = useState<IChatListItem[]>([]);
  const initialChats = useChatsFromWiki(workspacesList, workflowID);

  useEffect(() => {
    setChats(initialChats.sort(sortChat));
  }, [initialChats]);

  const onAddChat = useCallback(async (newItem: IChatListItem, oldItem?: IChatListItem) => {
    await addChatToWiki(newItem, oldItem);
    setChats((chats) => [...chats.filter(item => item.title !== newItem.title), newItem].sort(sortChat));
  }, []);

  const onDeleteChat = useCallback((item: IChatListItem) => {
    window.service.wiki.wikiOperation(
      WikiChannel.deleteTiddler,
      item.workspaceID,
      item.title,
    );
    setChats((chats) => chats.filter(chat => chat.id !== item.id).sort(sortChat));
  }, []);

  return [chats, onAddChat, onDeleteChat] as const;
}

export function useLoadInitialChatDataToStore(workspacesList: IWorkspaceWithMetadata[] | undefined, workflowID: string | undefined) {
  const updateChats = useChatsStore((state) => state.updateChats);
  const [initialChats] = useChatDataSource(workspacesList, workflowID);
  useEffect(() => {
    const chatsDict = initialChats.reduce<Record<string, IChatListItem>>((accumulator, chat) => {
      accumulator[chat.id] = chat;
      return accumulator;
    }, {});
    updateChats(chatsDict);
  }, [initialChats, updateChats]);
}