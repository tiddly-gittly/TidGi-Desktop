export interface UIEffectsContext {
  /**
   * Open a card with text field, return card ID.
   */
  addTextField(label: string, description?: string, introduction?: string): string;
  /**
   * Listen on result of user input, return a promise, resolved when user submit the input.
   * @param uiElementID ui element to listen, id is returned by addTextField
   */
  onSubmit(uiElementID: string): Promise<string>;
  remove(uiElementID: string): void;
}
