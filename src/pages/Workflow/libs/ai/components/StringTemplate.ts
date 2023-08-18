/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable unicorn/no-null */
import { getDataOrDefault } from '@/pages/Workflow/GraphEditor/utils/getDataOrDefault';
import Handlebars from 'handlebars';
import { Component } from 'noflo';

export const getComponent = () => new StringTemplate();
class StringTemplate extends Component {
  description = 'Produce a string from input data with a given "handlebars" template';
  icon = 'puzzle-piece';
  defaultValues: Record<string, string> = {};

  constructor() {
    super();

    this.inPorts.add('in', {
      datatype: 'string',
      description: 'Name of this input, should be a short text.',
      required: true,
    });
    this.inPorts.add('template', {
      datatype: 'string',
      description: 'Name of this input, should be a short text.',
      required: true,
    });

    this.outPorts.add('out', {
      datatype: 'string',
    });

    // Register a process handler for incoming data
    this.process((input, output, context) => {
      const template = getDataOrDefault('template', input, this.defaultValues);
      if (!template) {
        this.deactivate(context);
        return;
      }
      const compiledTemplate = Handlebars.compile(template);
      const props = {
        in: getDataOrDefault('in', input, this.defaultValues),
      };
      const resultText = compiledTemplate(props);
      output.sendDone({ out: resultText });
    });
  }
}
