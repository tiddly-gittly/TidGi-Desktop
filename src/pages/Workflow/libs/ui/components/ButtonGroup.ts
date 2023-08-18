/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable unicorn/no-null, @typescript-eslint/require-await */
// Load the NoFlo interface
import { getDataOrDefault } from '@/pages/Workflow/GraphEditor/utils/getDataOrDefault';
import { Component } from 'noflo';
import { LastArrayElement } from 'type-fest';
import type { IButtonGroupProps, UIEffectsContext } from '../types/UIEffectsContext';

export const getComponent = () => new ButtonGroup();
class ButtonGroup extends Component {
  description = 'Let user click on provided button and get clicked index.';
  icon = 'hand-pointer-o';
  uiElementID?: string;
  uiEffects?: UIEffectsContext;
  defaultValues: Record<string, string> = {};

  constructor() {
    super();

    this.inPorts.add('control', {
      datatype: 'bang',
      description: 'Trigger the input box to show.',
    });

    // Define the component's inports
    this.inPorts.add('intro', {
      datatype: 'string',
      description: 'Introduction text show before the buttons. Can be a multiple line long text.',
    });
    // add 3 buttons
    for (const index of [1, 2, 3]) {
      this.inPorts.add(`label${index}`, {
        datatype: 'string',
        description: `Text of the button ${index}, should be a short text.`,
        required: true,
      });
      this.inPorts.add(`desc${index}`, {
        datatype: 'string',
        description: `Description text show on the tooltip of button ${index}. Can be a one line long text.`,
      });
    }

    this.inPorts.add('ui_effects', {
      datatype: 'object',
      description: 'Used by system, inject UI related methods.',
      required: true,
    });

    // output clicked button index
    this.outPorts.add('out', {
      datatype: 'int',
    });

    // Register a process handler for incoming data
    this.process((input, output, context) => {
      this.uiEffects ??= input.getData('ui_effects') as UIEffectsContext | undefined;
      if (this.uiEffects === undefined) {
        this.deactivate(context);
        return;
      }
      // prepare data for ui element from inPorts
      const buttons: IButtonGroupProps['buttons'] = [];
      for (const index of [1, 2, 3]) {
        const label = getDataOrDefault<string>(`label${index}`, input, this.defaultValues);
        if (!label) continue;
        const button: LastArrayElement<IButtonGroupProps['buttons']> = { label };
        const description = getDataOrDefault<string>(`desc${index}`, input, this.defaultValues);
        if (description) {
          button.description = description;
        }
        buttons.push(button);
      }
      const props: IButtonGroupProps = {
        buttons,
        introduction: getDataOrDefault<string>('intro', input, this.defaultValues),
      };
      // If we already have an UI element created, update it. Otherwise, create a new one.
      if (this.uiElementID === undefined) {
        this.uiElementID = this.uiEffects.addElement({ type: 'buttonGroup', props });
        // wait for result, and sent to outPort
        void this.uiEffects.onSubmit(this.uiElementID).then(clickedButtonIndex => {
          this.uiElementID = undefined;
          output.sendDone({ out: clickedButtonIndex });
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
