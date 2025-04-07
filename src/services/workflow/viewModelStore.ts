import type { IButtonGroupProps, IResultTextProps, ITextFieldProps } from '@/pages/Workflow/libs/ui/types/UIEffectsContext';
import { isUndefined, mergeWith } from 'lodash';
import { createStore } from 'zustand/vanilla';

export interface UIChatItemState {
  /**
   * This message is created by who. Or is meant to be created by who (sometimes, text input's content may not set yet, still waiting for user's input, but it is still set to "created by user")
   */
  author: 'user' | 'agent';
  /**
   * nanoid and prefix by increasing number, so that it is unique in this chat and easy to sort.
   */
  id: string;
  /**
   * Additional Props for React UI element depending on type. See ITextFieldProps and IButtonGroupProps for example, this can be added by plugin, so can't be statically typed, just as an example here.
   * Structured data of this message. For TextResult, it can be just `{ content: string }`, but for more complex widgets, it can be a more complex object.
   */
  content: ITextFieldProps | IButtonGroupProps | IResultTextProps | Record<string, unknown>;
  type: 'textField' | 'buttonGroup' | 'textResult';
  timestamp: number;
}

/**
 * Represents the state machine execution state of a callback, not including the result, results that is valuable to user should be stored in UIElementState.content.
 */
export interface IExecutionState {
  /** The callback method name */
  method: string;
  state: 'running' | 'success' | 'error';
  /** The execution state of this callback, may based on xstate's serialized state */
  fullState: unknown;
}

/**
 * All state from database to restore an agent's back to alive.
 */
export interface AgentState {
  /** Chat items created during a chat and persisted execution result. Key is the id, for easy CRUD and sorting. */
  ui?: Record<string, UIChatItemState | undefined>;
  /** All callback's execution states, key is callback method name, value is array of state machine serialized state, because callback might execute multiple times. */
  execution?: Record<string, IExecutionState[]>;
}

export interface WorkflowViewModelStoreState extends AgentState {
  /** adds element and returns its ID */
  addChatItem: (element: Omit<UIChatItemState, 'timestamp' | 'id'>) => string;
  clearChatItem: () => void;
  removeChatItem: (id: string) => void;
  /** update existing Chat Item with new content (react props), content will merge with old content, undefined value will be omitted (to use old value) */
  updateChatItemContent: (element: Pick<UIChatItemState, 'id' | 'content'>) => void;
}

/**
 * Isomorphic store for UI state of a chat, runs in server side and client side. So don't use any browser/electron specific API here.
 * @param elements Existing UI state from database
 * @returns A new store for this chat
 */
export const getWorkflowViewModelStore = (initialState?: AgentState) =>
  createStore<WorkflowViewModelStoreState>((set) => ({
    ui: {},
    execution: {},
    ...initialState,
    addChatItem: (element) => {
      const id = String(Math.random());
      const newElement = {
        ...element,
        id,
        timestamp: Date.now(),
      };
      set((state) => ({ ui: { ...state.ui, [id]: newElement } }));
      return id;
    },
    updateChatItemContent: ({ id, content }) => {
      set((state) => {
        const existedElement = state.ui?.[id];
        if (existedElement !== undefined) {
          mergeWith(existedElement.content, content, (objectValue: unknown, sourceValue) => {
            if (isUndefined(sourceValue)) {
              return objectValue;
            }
          });
        }
        return { ui: { ...state.ui, [id]: existedElement } };
      });
    },
    removeChatItem: (id) => {
      set((state) => {
        const newUi = { ...state.ui, [id]: undefined };
        return { ui: newUi };
      });
    },
    clearChatItem: () => {
      set({ ui: {} });
    },
  }));
