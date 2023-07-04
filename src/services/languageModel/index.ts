import fs from 'fs-extra';
import { injectable } from 'inversify';
import path from 'path';
import { Observable } from 'rxjs';
import { ModuleThread, spawn, Worker } from 'threads';

import { lazyInject } from '@services/container';
import { logger } from '@services/libs/log';
import type { INativeService } from '@services/native/interface';
import serviceIdentifier from '@services/serviceIdentifier';

import { LANGUAGE_MODEL_FOLDER } from '@/constants/appPaths';
import { IWindowService } from '@services/windows/interface';
import { ILanguageModelService, ILLMResultPart, IRunLLAmaOptions } from './interface';
import { LLMWorker } from './llmWorker';

// @ts-expect-error it don't want .ts
// eslint-disable-next-line import/no-webpack-loader-syntax
import { getExistingParentDirectory } from '@/helpers/findPath';
import { i18n } from '@services/libs/i18n';
import { WindowNames } from '@services/windows/WindowProperties';
import { dialog } from 'electron';
import workerURL from 'threads-plugin/dist/loader?name=llmWorker!./llmWorker.ts';

@injectable()
export class LanguageModel implements ILanguageModelService {
  @lazyInject(serviceIdentifier.NativeService)
  private readonly nativeService!: INativeService;

  @lazyInject(serviceIdentifier.Window)
  private readonly windowService!: IWindowService;

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

  /**
   * Return true if the model exists, false otherwise. And will show a dialog to user if the model does not exist.
   * @param modelPath Absolute path to the model
   */
  private async checkModelExistsAndWarnUser(modelPath: string): Promise<boolean> {
    const exists = await fs.pathExists(modelPath);
    if (!exists) {
      const mainWindow = this.windowService.get(WindowNames.main);
      if (mainWindow !== undefined) {
        let pathToOpen = modelPath;
        void dialog
          .showMessageBox(mainWindow, {
            title: i18n.t('LanguageModel.ModelNotExist'),
            message: `${i18n.t('LanguageModel.ModelNotExistDescription')}: ${modelPath}`,
            buttons: ['OK', i18n.t('LanguageModel.OpenThisPath')],
            cancelId: 0,
            defaultId: 1,
          })
          .then(async ({ response }) => {
            if (response === 1) {
              pathToOpen = await getExistingParentDirectory(modelPath);
              await this.nativeService.openPath(pathToOpen);
            }
          })
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          .catch((error) => logger.error('checkModelExistsAndWarnUser failed', { pathToOpen, error }));
      }
    }
    return exists;
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
        if (!(await this.checkModelExistsAndWarnUser(modelPath))) {
          observer.error(new Error(`${i18n.t('LanguageModel.ModelNotExist')} ${modelPath}`));
          return;
        }
        const observable = worker.runLLama$({ prompt, modelPath, conversationID });
        observable.subscribe({
          next: (result) => {
            const loggerCommonMeta = { id: result.id, function: 'LanguageModel.runLLama$' };

            if ('type' in result && result.type === 'result') {
              const { token, id } = result;
              // prevent the case that the result is from previous or next conversation, where its Observable is not properly closed.
              if (id === conversationID) {
                observer.next({ token, id });
              }
            } else if ('level' in result) {
              if (result.level === 'error') {
                logger.error(`${result.error.message} ${result.error.stack ?? 'no stack'}`, loggerCommonMeta);
              } else {
                logger.log(result.level, `${result.message}`, loggerCommonMeta);
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
