import { injectable } from 'inversify';
import path from 'path';
import { Observable } from 'rxjs';
import { ModuleThread, spawn, Worker } from 'threads';

import { lazyInject } from '@services/container';
import { logger } from '@services/libs/log';
import type { INativeService } from '@services/native/interface';
import serviceIdentifier from '@services/serviceIdentifier';

import { LANGUAGE_MODEL_FOLDER } from '@/constants/appPaths';
import { ILanguageModelService, ILLMResultPart, IRunLLAmaOptions } from './interface';
import { LLMWorker } from './llmWorker';
// @ts-expect-error it don't want .ts
// eslint-disable-next-line import/no-webpack-loader-syntax
import workerURL from 'threads-plugin/dist/loader?name=llmWorker!./llmWorker.ts';

@injectable()
export class LanguageModel implements ILanguageModelService {
  @lazyInject(serviceIdentifier.NativeService)
  private readonly nativeService!: INativeService;

  private llmWorker?: ModuleThread<LLMWorker>;

  private async initWorker(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.llmWorker = await spawn<LLMWorker>(new Worker(workerURL), { timeout: 1000 * 60 });
  }

  /**
   * Ensure you get a started worker. If not stated, it will await for it to start.
   * @param workspaceID
   */
  private async getWorker(): Promise<ModuleThread<LLMWorker>> {
    if (this.llmWorker === undefined) {
      await this.initWorker();
    } else {
      return this.llmWorker;
    }
    if (this.llmWorker === undefined) {
      const errorMessage = `Still no llmWorker after init. No running worker, maybe worker failed to start`;
      logger.error(
        errorMessage,
        {
          function: 'callWikiIpcServerRoute',
        },
      );
      throw new Error(errorMessage);
    }
    return this.llmWorker;
  }

  public runLLama$(options: IRunLLAmaOptions): Observable<ILLMResultPart> {
    const { id: conversationID } = options;
    return new Observable<ILLMResultPart>((observer) => {
      const getWikiChangeObserverIIFE = async () => {
        const worker = await this.getWorker();

        const template = `How to write a science fiction?`;
        const prompt = `A chat between a user and a useful assistant.
USER: ${template}
ASSISTANT:`;
        // TODO: get default model name from preference
        const defaultModelName = 'llama.bin';
        const modelName = options.modelName ?? defaultModelName;
        const modelPath = path.join(LANGUAGE_MODEL_FOLDER, modelName);
        const observable = worker.runLLama$({ prompt, modelPath, conversationID });
        observable.subscribe({
          next: (result) => {
            if ('type' in result && result.type === 'result') {
              const { token, id } = result;
              // prevent the case that the result is from previous or next conversation, where its Observable is not properly closed.
              if (id === conversationID) {
                observer.next({ token, id });
              }
            }
          },
          error: (error) => {
            observer.error(error);
          },
          complete: () => {
            observer.complete();
          },
        });
      };
      void getWikiChangeObserverIIFE();
    });
  }
}
