import { IButtonGroupProps, IResultTextProps, ITextFieldProps } from '@/pages/Workflow/libs/ui/types/UIEffectsContext';
import { isUndefined, mergeWith } from 'lodash';
import { createStore } from 'zustand/vanilla';

export interface UIElementState {
  /**
   * This message is created by who. Or is meant to be created by who (sometimes, text input's content may not set yet, still waiting for user's input, but it is still set to "created by user")
   */
  author: 'user' | 'agent';
  /**
   * The data to submit to the noflo node.
   * can be string for textField or clicked index of buttons for buttonGroup, etc.
   * Same content may also exist in the props for user generated message, but it is not guaranteed.
   */
  content: unknown;
  id: string;
  isSubmitted: boolean;
  /**
   * Additional Props for UI element. See ITextFieldProps and IButtonGroupProps for example, this can be added by plugin, so can't be statically typed, just as an example here.
   * Structured data of this message. For TextResult, it can be just `{ content: string }`, but for more complex widgets, it can be a more complex object.
   */
  props: ITextFieldProps | IButtonGroupProps | IResultTextProps | Record<string, unknown>;
  timestamp: number;
  type: 'textField' | 'buttonGroup' | 'textResult' | string;
}
export interface SingleChatState {
  elements?: Record<string, UIElementState | undefined>;
  // TODO: Add states here, as described in [WorkflowNetwork](src/services/database/entity/WorkflowNetwork.ts)'s `serializedState`
}

export interface UIStoreState extends SingleChatState {
  /** adds element and returns its ID */
  addElement: (element: Pick<UIElementState, 'type' | 'props' | 'author'>) => string;
  clearElements: () => void;
  removeElement: (id: string) => void;
  submitElement: (id: string, content: unknown) => void;
  /** update existing element with new props, props will merge with old props, undefined value will be omitted (to use old value) */
  updateElementProps: (element: Pick<UIElementState, 'id' | 'props'>) => void;
}

/**
 * Props for UI element to support submit
 */
export interface IUiElementSubmitProps {
  id: string;
  isSubmitted: boolean;
  onSubmit: (id: string, content: unknown) => void;
}

export const uiStore = createStore<UIStoreState>((set) => ({
  elements: {},
  addElement: ({ type, props, author }) => {
    const id = String(Math.random());
    const newElement = {
      author,
      content: undefined,
      id,
      isSubmitted: false,
      props,
      timestamp: Date.now(),
      type,
    };
    set((state) => ({ elements: { ...state.elements, [id]: newElement } }));
    return id;
  },
  updateElementProps: ({ id, props }) => {
    set((state) => {
      const existedElement = state.elements?.[id];
      if (existedElement !== undefined) {
        mergeWith(existedElement.props, props, (objectValue: unknown, sourceValue) => {
          if (isUndefined(sourceValue)) {
            return objectValue;
          }
        });
      }
      return { elements: { ...state.elements, [id]: existedElement } };
    });
  },
  submitElement: (id, content) => {
    set((state) => {
      const existedElement = state.elements?.[id];
      if (existedElement !== undefined) {
        existedElement.content = content;
        existedElement.isSubmitted = true;
      }
      return { elements: { ...state.elements, [id]: existedElement } };
    });
  },
  removeElement: (id) => {
    set((state) => {
      const newElements = { ...state.elements, [id]: undefined };
      return { elements: newElements };
    });
  },
  clearElements: () => {
    set({ elements: {} });
  },
}));
