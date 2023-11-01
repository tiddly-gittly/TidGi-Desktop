import { chatTiddlerTagName } from '@services/wiki/plugin/nofloWorkflow/constants';
import i18n from 'i18next';
import { mergeWith } from 'lodash';
import { immer } from 'zustand/middleware/immer';
import { createStore } from 'zustand/vanilla';
import { UIElementState } from '../libs/ui/debugUIEffects/store';
import { addChatToWiki, deleteChatFromWiki, IChatListItem } from './useChatDataSource';
import { addNewNetwork } from './useChatNetworkExecute';

export interface ChatsStoreState {
  activeChatID?: string;
  chats: Record<string, IChatListItem | undefined>;
}
/**
 * State is not directly persisted to the database, but store in the `serializedState` field of each networks in `src/services/database/entity/WorkflowNetwork.ts`.
 */
export interface ChatsStoreActions {
  /**
   * Create Noflo Network on the server and create an record for chat history in the database.
   * Optionally, Add a chat tiddler containing the chat history.
   * @param fields `workflowID` is `graphTiddlerTitle`, just different name, it is the tiddler containing the JSON of fbpGraph.
   * @returns
   */
  addChat: (fields: { title?: string; workflowID: string; workspaceID: string }, options?: { addToWiki?: boolean }) => Promise<IChatListItem>;
  addElementToChat: (chatID: string, element: Pick<UIElementState, 'type' | 'props' | 'author'>) => string;
  clearElementsInChat: (chatID: string) => void;
  getChat: (chatID: string) => IChatListItem | undefined;
  removeChat: (workspaceID: string, chatID: string) => void;
  removeElementFromChat: (chatID: string, id: string) => void;
  renameChat: (chatID: string, newTitle: string) => Promise<void>;
  setActiveChatID: (chatID: string) => void;
  submitElementInChat: (chatID: string, id: string, content: unknown) => void;
  updateChats: (chats: Record<string, IChatListItem | undefined>) => void;
  updateElementPropsInChat: (chatID: string, element: Pick<UIElementState, 'id' | 'props'>) => void;
}

export const chatsStore = createStore(
  immer<ChatsStoreState & ChatsStoreActions>((set) => ({
    chats: {},
    activeChatID: undefined,

    setActiveChatID: (chatID) => {
      set((state) => {
        state.activeChatID = chatID;
      });
    },

    updateChats: (chats) => {
      set((state) => {
        state.chats = chats;
      });
    },

    getChat: (chatID) => {
      let result;
      set((state) => {
        result = state.chats[chatID];
      });
      return result;
    },

    addChat: async (fields, options) => {
      const { workflowID, workspaceID } = fields;
      // make sure adding network succeeded before adding chat item, workflowID is the id of the graph to use
      const newChatID = await addNewNetwork(workspaceID, workflowID);
      const newChatItem = { chatJSON: { elements: {} }, id: newChatID, tags: [chatTiddlerTagName], title: i18n.t('Workflow.NewChat'), ...fields };
      // wiki operation
      if (options?.addToWiki === true) {
        await addChatToWiki(newChatItem);
      }
      set((state) => {
        state.chats[newChatID] = newChatItem;
        state.activeChatID = newChatID;
      });
      return newChatItem;
    },

    addElementToChat: (chatID, { type, props, author }) => {
      const elementID = String(Math.random());
      const newElement: UIElementState = {
        author,
        content: undefined,
        id: elementID,
        isSubmitted: false,
        props,
        timestamp: Date.now(),
        type,
      };
      set((state) => {
        const chat = state.chats[chatID];
        if (chat === undefined) return;
        chat.chatJSON ??= { elements: {} } satisfies { elements: Record<string, UIElementState | undefined> };
        chat.chatJSON.elements ??= {};
        chat.chatJSON.elements[elementID] = newElement;
      });
      return elementID;
    },

    updateElementPropsInChat: (chatID, { id, props }) => {
      set((state) => {
        const element = state.chats[chatID]?.chatJSON?.elements?.[id];
        if (element !== undefined) {
          mergeWith(element.props, props, (objectValue: unknown, sourceValue: unknown) => {
            if (sourceValue === undefined) {
              return objectValue;
            }
            return sourceValue;
          });
        }
      });
    },

    submitElementInChat: (chatID, id, content) => {
      set((state) => {
        const element = state.chats[chatID]?.chatJSON?.elements?.[id];
        if (element !== undefined) {
          element.content = content;
          element.isSubmitted = true;
        }
      });
    },

    removeElementFromChat: (chatID, id) => {
      set((state) => {
        const chatJSON = state.chats[chatID]?.chatJSON;
        if ((chatJSON) !== undefined) {
          chatJSON.elements ??= {};
          chatJSON.elements[id] = undefined;
        }
      });
    },

    clearElementsInChat: (chatID) => {
      set((state) => {
        const chatJSON = state.chats[chatID]?.chatJSON;
        if ((chatJSON) !== undefined) {
          chatJSON.elements = {};
        }
      });
    },

    removeChat: (workspaceID, chatID) => {
      set((state) => {
        state.chats[chatID] = undefined;
        if (chatID === state.activeChatID) {
          state.activeChatID = undefined;
        }
      });

      // wiki operation
      void deleteChatFromWiki(workspaceID, chatID);
    },

    renameChat: async (chatID, newTitle) => {
      set((state) => {
        if (state.chats[chatID] === undefined) return;
        state.chats[chatID]!.title = newTitle;
      });
      // wiki operation
      const result = chatsStore.getState().chats[chatID];
      if (result !== undefined) {
        await addChatToWiki(result);
      }
    },
  })),
);
