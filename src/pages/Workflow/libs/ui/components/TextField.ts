/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable unicorn/no-null, @typescript-eslint/require-await */
// Load the NoFlo interface
import { getDataOrDefault } from '@/pages/Workflow/GraphEditor/utils/getDataOrDefault';
import { Component } from 'noflo';
import type { ITextFieldProps, UIEffectsContext } from '../types/UIEffectsContext';

export const getComponent = () => new TextField();
class TextField extends Component {
  description = 'Wait for user input some text.';
  icon = 'commenting-o';
  uiElementID?: string;
  uiEffects?: UIEffectsContext;
  defaultValues: Record<string, string> = {};

  constructor() {
    super();

    // Define the component's inports
    this.inPorts.add('control', {
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
    this.process((input, output, context) => {
      this.uiEffects ??= input.getData('ui_effects') as UIEffectsContext | undefined;
      if (this.uiEffects === undefined) {
        // TODO: directly return when https://github.com/noflo/noflo/issues/1048 is fixed.
        this.deactivate(context);
        return;
      }
      // If 'in' port is not triggered, return
      if (!input.hasData('control')) {
        this.deactivate(context);
        return;
      }
      const control = input.getData('control') as undefined | null | true;
      // rapidly receive null here, still stuck
      if (control !== true) {
        this.deactivate(context);
        return;
      }
      const props: ITextFieldProps = {
        label: getDataOrDefault('label', input, this.defaultValues),
        description: getDataOrDefault('desc', input, this.defaultValues),
        introduction: getDataOrDefault('intro', input, this.defaultValues),
        placeholder: getDataOrDefault('placeholder', input, this.defaultValues),
      };
      // If we already have an UI element created, update it. Otherwise, create a new one.
      if (this.uiElementID === undefined) {
        this.uiElementID = this.uiEffects.addElement({ type: 'textField', props });
        // wait for result, and sent to outPort
        // TODO: change to async await when https://github.com/noflo/noflo/issues/1047 is fixed.
        void this.uiEffects.onSubmit(this.uiElementID).then(resultText => {
          this.uiElementID = undefined;
          output.sendDone({ out: resultText });
        });
      } else {
        this.uiEffects.updateElementProps({ id: this.uiElementID, props });
        this.deactivate(context);
      }
    });
  }

  async tearDown() {
    if (this.uiElementID !== undefined) {
      // set to submit state
      this.uiEffects?.submitElement?.(this.uiElementID, null);
    }
  }
}
