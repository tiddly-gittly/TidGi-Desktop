/**
 * // TODO: save/load chat from tiddler instead of from sqlite. Normally most of chats are store in sqlite, and only important chats check by user are saved to wiki here.
 */
import { WikiChannel } from '@/constants/channels';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { chatTiddlerTagName } from '@services/wiki/plugin/nofloWorkflow/constants';
import { IWorkerWikiOperations } from '@services/wiki/wikiOperations/executor/wikiOperationInServer';
import type { AgentState } from '@services/workflow/viewModelStore';
import { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { useEffect, useState } from 'react';
import type { ITiddlerFields } from 'tiddlywiki';
import { useChatsStore } from '../../pages/Agent/RunWorkflow/useChatsStore';


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
          const chatTiddlers = await window.service.wiki.wikiOperationInServer(
            WikiChannel.getTiddlersAsJson,
            workspace.id,
            [`[all[tiddlers]tag[${chatTiddlerTagName}]field:workflowID[${workflowID}]]`],
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
            id: tiddler.title,
            title: (tiddler.caption as string | undefined) ?? tiddler.title,
            chatJSONString: tiddler.text,
            chatJSON: JSON.parse(tiddler.text) as AgentState,
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

export async function addChatToWiki(newItem: IChatListItem) {
  await window.service.wiki.wikiOperationInServer(
    WikiChannel.addTiddler,
    newItem.workspaceID,
    [
      newItem.id,
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
      newItem.chatJSONString || '{}',
      JSON.stringify({
        caption: newItem.title,
        type: 'application/json',
        tags: [...newItem.tags, chatTiddlerTagName],
        description: newItem.description ?? '',
        'page-cover': newItem.image ?? '',
        workflowID: newItem.workflowID,
      }),
      JSON.stringify({ withDate: true }),
    ] as Parameters<IWorkerWikiOperations[WikiChannel.addTiddler]>,
  );
}

export async function deleteChatFromWiki(workspaceID: string, chatID: string) {
  await window.service.wiki.wikiOperationInServer(
    WikiChannel.deleteTiddler,
    workspaceID,
    [chatID],
  );
}

/**
 * Get chats related methods based on workflow ID.
 * @param workspacesList Workspaces that the user has access to, as data source.
 * @param workflowID The workflow ID that these chats were generated with.
 */
export function useLoadInitialChats(workspacesList: IWorkspaceWithMetadata[] | undefined, workflowID: string | undefined) {
  const initialChats = useChatsFromWiki(workspacesList, workflowID);
  const {
    updateChats,
  } = useChatsStore((state) => ({
    updateChats: state.updateChats,
  }));

  useEffect(() => {
    const chatsDict = initialChats.reduce<Record<string, IChatListItem>>((accumulator, chat) => {
      accumulator[chat.id] = chat;
      return accumulator;
    }, {});
    updateChats(chatsDict);
  }, [initialChats, updateChats]);
}

// connect store and dataSource

// export function useWorkspaceIDToStoreNewChats(workspacesList: IWorkspaceWithMetadata[] | undefined) {
//   const [workspaceIDToStoreNewChats, setWorkspaceIDToStoreNewChats] = useState<string | undefined>();
//   // set workspaceIDToStoreNewChats on initial load && workspacesList has value, make it default to save to first workspace.
//   useEffect(() => {
//     if (workspaceIDToStoreNewChats === undefined && workspacesList?.[0] !== undefined) {
//       const workspaceID = workspacesList[0].id;
//       setWorkspaceIDToStoreNewChats(workspaceID);
//     }
//   }, [workspaceIDToStoreNewChats, workspacesList]);
//   return workspaceIDToStoreNewChats;
// }
