import { UIStoreState } from '@/pages/Workflow/libs/ui/debugUIEffects/store';

export interface ITextFieldProps {
  description?: string;
  introduction?: string;
  label: string;
  placeholder?: string;
}
export interface IButtonGroupProps {
  buttons: Array<{
    /**
     * tooltip for the button.
     */
    description?: string;
    /**
     * Text of the button, should be a short text.
     */
    label: string;
  }>;
  introduction?: string;
}
export interface IResultTextProps {
  content: string;
}

export interface UIEffectsContext extends UIStoreState {
  /**
   * Listen on result of user input, return a promise, resolved when user submit the input.
   * This does not exist on UIStoreState because it is not a store action, it is wrapped and provided by workflow runtime.
   * @param uiElementID ui element to listen, id is returned by addTextField
   */
  onSubmit(uiElementID: string): Promise<unknown>;
}
