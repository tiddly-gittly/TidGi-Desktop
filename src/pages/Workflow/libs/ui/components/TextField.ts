/* eslint-disable unicorn/no-null, @typescript-eslint/require-await */
// Load the NoFlo interface
import { Component } from 'noflo';
import type { ITextFieldProps, UIEffectsContext } from '../types/UIEffectsContext';

export const getComponent = () => new TextField();
class TextField extends Component {
  description = 'Wait for user input some text.';
  icon = 'commenting-o';
  uiElementID?: string;
  uiEffects?: UIEffectsContext;

  constructor() {
    super();

    // Define the component's inports
    this.inPorts.add('in', {
      datatype: 'bang',
      description: 'Trigger the input box to show.',
    });

    this.inPorts.add('label', {
      datatype: 'string',
      description: 'Name of this input, should be a short text.',
      required: true,
    });
    this.inPorts.add('desc', {
      datatype: 'string',
      description: 'Description text show on the input box. Can be a one line long text.',
    });
    this.inPorts.add('intro', {
      datatype: 'string',
      description: 'Introduction text show before the input box. Can be a multiple line long text.',
    });
    this.inPorts.add('placeholder', {
      datatype: 'string',
      description: 'Text to display when the input box is empty.',
    });

    this.inPorts.add('ui_effects', {
      datatype: 'object',
      description: 'Used by system, inject UI related methods.',
      required: true,
    });

    this.outPorts.add('out', {
      datatype: 'string',
    });

    // Register a process handler for incoming data
    this.process(async (input, output) => {
      this.uiEffects ??= input.getData('ui_effects') as UIEffectsContext | undefined;
      if (this.uiEffects === undefined) return;
      const label = input.getData('label') as string;
      const desc = input.getData('desc') as string | undefined;
      const intro = input.getData('intro') as string | undefined;
      const placeholder = input.getData('placeholder') as string | undefined;
      const props: ITextFieldProps = {
        label,
        description: desc,
        introduction: intro,
        placeholder,
      };
      // If we already have an UI element created, update it. Otherwise, create a new one.
      if (this.uiElementID === undefined) {
        this.uiElementID = this.uiEffects.addElement({ type: 'textField', props });
        // wait for result, and sent to outPort
        const resultText = await this.uiEffects.onSubmit(this.uiElementID);
        output.sendDone({ out: resultText });
      } else {
        this.uiEffects.updateElementProps({ id: this.uiElementID, props });
      }
    });
  }

  async tearDown() {
    if (this.uiElementID !== undefined) {
      this.uiEffects?.removeElement?.(this.uiElementID);
    }
  }
}
