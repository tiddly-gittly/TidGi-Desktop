import type { INetworkState } from '@services/workflow/interface';
import { getWorkflowViewModelStore, type WorkflowViewModelStoreState } from '@services/workflow/viewModelStore';
import type { BehaviorSubject, Observer } from 'rxjs';
import { immer } from 'zustand/middleware/immer';
import { createStore, StoreApi } from 'zustand/vanilla';
import { addNewNetwork } from './useChatNetworkExecute';

const chatViewModelObservables = new Map<string, BehaviorSubject<INetworkState>>();
export const chatViewModels = new Map<string, StoreApi<WorkflowViewModelStoreState>>();

export interface ChatsStoreState {
  activeChatID?: string;
  chatIDs: string[];
}
/**
 * State is not directly persisted to the database, but store in the `serializedState` field of each networks in `src/services/database/entity/WorkflowNetwork.ts`.
 */
export interface ChatsStoreActions {
  /**
   * Create Noflo Network on the server and create an record for chat history in the database.
   * Optionally, Add a chat tiddler containing the chat history.
   * @param fields `workflowID` is `graphTiddlerTitle`, just different name, it is the tiddler containing the JSON of fbpGraph.
   * @returns chat ID
   */
  addChat: (fields: { workflowID: string; workspaceID: string }) => Promise<string>;
  removeChat: (workspaceID: string, chatID: string) => void;
  setActiveChatID: (chatID: string) => void;
}

export const chatsStore = createStore(
  immer<ChatsStoreState & ChatsStoreActions>((set) => ({
    activeChatID: undefined,
    chatIDs: [],

    setActiveChatID: (chatID) => {
      set((state) => {
        state.activeChatID = chatID;
      });
    },

    addChat: async (fields) => {
      const { workflowID, workspaceID } = fields;
      // make sure adding network succeeded before adding chat item, workflowID is the id of the graph to use
      const { id: newNetworkID, state } = await addNewNetwork(workspaceID, workflowID);
      const newChatStore = getWorkflowViewModelStore(state.viewModel);
      const chatViewModelObservable = window.observables.workflow.subscribeNetworkState$(newNetworkID);
      const observer: Observer<INetworkState> = {
        next: (newState) => {
          newChatStore.setState(newState.viewModel);
        },
        error: () => {},
        complete: () => {},
      };
      chatViewModelObservable.subscribe(observer);
      chatViewModels.set(newNetworkID, newChatStore);
      chatViewModelObservables.set(newNetworkID, chatViewModelObservable);
      set((state) => {
        state.activeChatID = newNetworkID;
        state.chatIDs.push(newNetworkID);
      });
      return newNetworkID;
    },

    removeChat: (workspaceID, chatID) => {
      set((state) => {
        chatViewModels.delete(chatID);
        // unsubscribe and delete
        const chatViewModelObservable = chatViewModelObservables.get(chatID);
        if (chatViewModelObservable !== undefined) {
          chatViewModelObservable.unsubscribe();
        }
        chatViewModelObservables.delete(chatID);
        if (chatID === state.activeChatID) {
          state.activeChatID = undefined;
          state.chatIDs = state.chatIDs.filter((id) => id !== chatID);
        }
      });
    },
  })),
);
