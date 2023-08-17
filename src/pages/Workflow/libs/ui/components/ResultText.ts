/* eslint-disable unicorn/no-null, @typescript-eslint/require-await */
// Load the NoFlo interface
import { Component } from 'noflo';
import type { IResultTextProps, UIEffectsContext } from '../types/UIEffectsContext';

export const getComponent = () => new ResultText();
class ResultText extends Component {
  description = 'Result text from workflow or LLM.';
  icon = 'check-square-o';
  uiElementID?: string;
  uiEffects?: UIEffectsContext;

  constructor() {
    super();

    this.inPorts.add('ui_effects', {
      datatype: 'object',
      description: 'Used by system, inject UI related methods.',
      required: true,
    });

    // Define the component's inports
    this.inPorts.add('in', {
      datatype: 'string',
      description: 'Result text to display.',
    });

    this.outPorts.add('out', {
      datatype: 'bang',
    });

    // Register a process handler for incoming data
    this.process((input, output) => {
      this.uiEffects ??= input.getData('ui_effects') as UIEffectsContext | undefined;
      if (this.uiEffects === undefined) return;
      if (!input.hasData('in')) return;
      const content = input.getData('in') as string;
      if (content === null || content === undefined) return;
      const props: IResultTextProps = {
        content,
      };
      this.uiElementID = this.uiEffects.addElement({ type: 'textResult', props });
      output.sendDone({ out: true });
    });
  }

  async tearDown() {
    if (this.uiElementID !== undefined) {
      // set to submit state
      this.uiEffects?.submitElement?.(this.uiElementID, null);
    }
  }
}
