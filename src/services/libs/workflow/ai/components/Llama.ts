/* eslint-disable unicorn/no-null */
// Load the NoFlo interface
import { ILLMResultPart, LanguageModelRunner } from '@services/languageModel/interface';
import { Component } from 'noflo';
import { Observable } from 'rxjs';

const runner = LanguageModelRunner.llamaCpp;

class LLaMaChat extends Component {
  description = 'Call local Llama model';
  icon = 'file';
  /**
   * Only allow one conversation at a time. If this is not null, it means there is a conversation in progress.
   * Use backpressure to prevent new input from being processed until the current conversation is done.
   */
  currentConversationID: string | null = null;

  constructor() {
    super();

    // Define the component's inports
    this.inPorts.add('prompt', {
      datatype: 'string',
      description: 'Input for LLM',
      required: true,
    });
    this.inPorts.add('cpu_count', {
      datatype: 'number',
      description: 'Number of CPU cores to use',
      required: true,
      default: 4,
    });

    // token by token
    this.outPorts.add('token', {
      datatype: 'string',
    });
    // full result when done
    this.outPorts.add('result', {
      datatype: 'string',
    });

    // Register a process handler for incoming data
    this.process((input, output) => {
      /**
       * If there's a conversation in progress, skip processing the new input.
       * Use backpressure to prevent new input from being processed until the current conversation is done.
       * @url
       */
      if (this.currentConversationID !== null) {
        return;
      }
      if (!input.hasData('prompt')) {
        return;
      }
      this.currentConversationID = String(Date.now());
      // Retrieve the incoming data from the inport
      const prompt = input.getData('prompt') as string;
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      const cpuCount = input.getData('cpu_count') as number || 4;

      const runnerResultObserver: Observable<ILLMResultPart> = window.observables.languageModel.runLanguageModel$(runner, {
        completionOptions: {
          prompt,
          nThreads: cpuCount,
        },
        id: this.currentConversationID,
      });

      /**
       * Wait for Observable to done, then send this full output.
       */
      let fullResult = '';
      // Subscribe to the observable to process the results
      runnerResultObserver.subscribe({
        next: (resultPart: ILLMResultPart) => {
          // Process the result part as needed
          // For this example, we'll just send the result to the outport
          output.send({
            token: resultPart.token,
          });
          fullResult += resultPart.token;
        },
        complete: () => {
          this.currentConversationID = null;
          output.send({
            result: fullResult,
          });
          // Mark the process as finished
          output.done();
        },
        error: (error: Error) => {
          this.currentConversationID = null;
          output.done(error);
        },
      });
    });
  }

  async tearDown() {
    if (this.currentConversationID !== null) {
      await window.service.languageModel.abortLanguageModel(runner, this.currentConversationID);
    }
  }
}

// Register the component
export const getComponent = () => new LLaMaChat();
