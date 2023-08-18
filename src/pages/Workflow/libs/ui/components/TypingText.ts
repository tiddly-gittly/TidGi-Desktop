/* eslint-disable unicorn/no-null, @typescript-eslint/require-await */
// Load the NoFlo interface
import { Component } from 'noflo';
import type { IResultTextProps, UIEffectsContext } from '../types/UIEffectsContext';

export const getComponent = () => new TypingText();
class TypingText extends Component {
  description = 'Display stream of text token from LLM.';
  icon = 'check-square-o';
  uiElementID?: string;
  currentText = '';
  uiEffects?: UIEffectsContext;

  constructor() {
    super();

    // Define the component's inports
    this.inPorts.add('in', {
      datatype: 'string',
      description: 'Stream of text to display.',
    });

    this.inPorts.add('ui_effects', {
      datatype: 'object',
      description: 'Used by system, inject UI related methods.',
      required: true,
    });

    this.outPorts.add('out', {
      datatype: 'bang',
    });

    // Register a process handler for incoming data
    this.process((input, output, context) => {
      this.uiEffects ??= input.getData('ui_effects') as UIEffectsContext | undefined;
      if (this.uiEffects === undefined) {
        this.deactivate(context);
        return;
      }
      const inIP = input.get('in');
      if (inIP === undefined || Array.isArray(inIP) || inIP.type === 'openBracket') {
        this.deactivate(context);
        return;
      }
      if (inIP.type === 'closeBracket') {
        this.uiElementID = undefined;
        output.sendDone({ out: true });
        return;
      }
      this.currentText += inIP.data as string;
      const props: IResultTextProps = {
        content: this.currentText,
      };
      // If we already have an UI element created, update it. Otherwise, create a new one.
      if (this.uiElementID === undefined) {
        this.uiElementID = this.uiEffects.addElement({ type: 'textResult', props });
      } else {
        this.uiEffects.updateElementProps({ id: this.uiElementID, props });
      }
      this.deactivate(context);
    });
  }

  async tearDown() {
    if (this.uiElementID !== undefined) {
      // set to submit state
      this.uiEffects?.submitElement?.(this.uiElementID, null);
    }
  }
}
