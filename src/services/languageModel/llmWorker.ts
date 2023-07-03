/* eslint-disable @typescript-eslint/no-misused-promises */
import 'source-map-support/register';
import { Observable } from 'rxjs';
import { expose } from 'threads/worker';
// index.mjs
import { LLM } from 'llama-node';
import { LLamaCpp } from 'llama-node/dist/llm/llama-cpp.js';
import { ILanguageModelLogMessage } from './interface';
// import path from 'path';

function runLLama(
  userPrompt: string,
  modelPath: string,
  conversationID: string,
): Observable<ILanguageModelLogMessage> {
  return new Observable<ILanguageModelLogMessage>((observer) => {
    void (async function runLLamaObservableIIFE() {
      try {
        const model = '/Users/linonetwo/Downloads/ggml-vic7b-q5_1.bin'; /* path.resolve(process.cwd(), '../ggml-vic7b-q5_1.bin') */
        const llama = new LLM(LLamaCpp);
        const config = {
          modelPath: model,
          enableLogging: true,
          nCtx: 1024,
          seed: 0,
          f16Kv: false,
          logitsAll: false,
          vocabOnly: false,
          useMlock: false,
          embedding: false,
          useMmap: true,
          nGpuLayers: 0,
        };

        const template = `How to write a science fiction?`;
        const prompt = `A chat between a user and a useful assistant.
USER: ${template}
ASSISTANT:`;
        await llama.load(config);

        await llama.createCompletion(
          {
            nThreads: 4,
            nTokPredict: 2048,
            topK: 40,
            topP: 0.1,
            temp: 0.2,
            // repeatPenalty: 1,
            prompt,
          },
          (response) => {
            const { completed, token } = response;
            observer.next({ type: 'result', token, id: conversationID });
            if (completed) {
              observer.complete();
            }
          },
        );
      } catch (error) {
        if (error instanceof Error) {
          observer.next({ level: 'error', error, id: conversationID });
        } else {
          observer.next({ level: 'error', error: new Error(String(error)), id: conversationID });
        }
      }
    })();
  });
}


const llmWorker = { runLLama };
export type LLMWorker = typeof llmWorker;
expose(llmWorker);
