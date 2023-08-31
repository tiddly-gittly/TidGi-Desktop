import { mergeWith } from 'lodash';
import { immer } from 'zustand/middleware/immer';
import { createStore } from 'zustand/vanilla';
import { UIElementState } from '../libs/ui/debugUIEffects/store';
import { IChatListItem } from './useChatDataSource';

export interface ChatsStoreState {
  chats: Record<string, IChatListItem | undefined>;
}
export interface ChatsStoreActions {
  addChat: (fields: { title?: string; workflowID: string; workspaceID: string }) => string;
  addElementToChat: (chatID: string, element: Pick<UIElementState, 'type' | 'props' | 'author'>) => string;
  clearElementsInChat: (chatID: string) => void;
  removeChat: (chatID: string) => void;
  removeElementFromChat: (chatID: string, id: string) => void;
  submitElementInChat: (chatID: string, id: string, content: unknown) => void;
  updateChats: (chats: Record<string, IChatListItem | undefined>) => void;
  updateElementPropsInChat: (chatID: string, element: Pick<UIElementState, 'id' | 'props'>) => void;
}

export const chatsStore = createStore(
  immer<ChatsStoreState & ChatsStoreActions>((set) => ({
    chats: {},

    updateChats: (chats) => {
      set((state) => {
        state.chats = chats;
      });
    },

    addChat: (fields) => {
      const id = String(Math.random());
      set((state) => {
        state.chats[id] = { chatJSON: { elements: {} }, id, tags: [], title: 'New Chat', ...fields };
      });
      return id;
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
        chat.chatJSON.elements[elementID] = newElement;
      });
      return elementID;
    },

    updateElementPropsInChat: (chatID, { id, props }) => {
      set((state) => {
        const element = state.chats[chatID]?.chatJSON?.elements[id];
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
        const element = state.chats[chatID]?.chatJSON?.elements[id];
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

    removeChat: (chatID) => {
      set((state) => {
        state.chats[chatID] = undefined;
      });
    },
  })),
);
