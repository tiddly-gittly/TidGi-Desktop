import { IButtonGroupProps, ITextFieldProps } from '@services/libs/workflow/ui/types/UIEffectsContext';
import { createStore } from 'zustand/vanilla';

export interface UIElementState {
  /**
   * The data to submit to the noflo node.
   * can be string for textField or clicked index of buttons for buttonGroup, etc.
   */
  content: unknown;
  id: string;
  isSubmitted: boolean;
  /**
   * Props for UI element. See ITextFieldProps and IButtonGroupProps for example, this can be added by plugin, so can't be statically typed, just as an example here.
   */
  props: ITextFieldProps | IButtonGroupProps | unknown;
  type: 'textField' | 'buttonGroup' | 'textResult' | string;
}

export interface UIStoreState {
  addElement: (element: Pick<UIElementState, 'type' | 'props'>) => string;
  elements: Record<string, UIElementState | undefined>;
  removeElement: (id: string) => void;
  // adds element and returns its ID
  submitElement: (id: string, content: unknown) => void;
}

/**
 * Props for UI element to support submit
 */
export interface IUiElementSubmitProps {
  id: string;
  onSubmit: (id: string, content: unknown) => void;
}

export const uiStore = createStore<UIStoreState>((set) => ({
  elements: {},
  addElement: ({ type, props }) => {
    const id = String(Math.random());
    const newElement = {
      content: undefined,
      id,
      isSubmitted: false,
      props,
      type,
    };
    set((state) => ({ elements: { ...state.elements, [id]: newElement } }));
    return id;
  },
  submitElement: (id, content) => {
    set((state) => {
      const existedElement = state.elements[id];
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
}));
