import { dialog } from 'electron';
import fs from 'fs-extra';
import { injectable } from 'inversify';
import path from 'path';
import { Observable } from 'rxjs';
import { ModuleThread, spawn, Worker } from 'threads';

// @ts-expect-error it don't want .ts
// eslint-disable-next-line import/no-webpack-loader-syntax
import workerURL from 'threads-plugin/dist/loader?name=llmWorker!./llmWorker/index.ts';

import { LANGUAGE_MODEL_FOLDER } from '@/constants/appPaths';
import { RWKV_CPP_TOKENIZER_PATH } from '@/constants/paths';
import { getExistingParentDirectory } from '@/helpers/findPath';
import { lazyInject } from '@services/container';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import type { INativeService } from '@services/native/interface';
import { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { ILanguageModelService, ILLMResultPart, IRunLLAmaOptions, IRunRwkvOptions, LanguageModelRunner } from './interface';
import { LLMWorker } from './llmWorker/index';

@injectable()
export class LanguageModel implements ILanguageModelService {
  @lazyInject(serviceIdentifier.NativeService)
  private readonly nativeService!: INativeService;

  @lazyInject(serviceIdentifier.Window)
  private readonly windowService!: IWindowService;

  @lazyInject(serviceIdentifier.Preference)
  private readonly preferenceService!: IPreferenceService;

  private llmWorker?: ModuleThread<LLMWorker>;

  private async initWorker(): Promise<void> {
    logger.debug(`initial llmWorker with  ${workerURL as string}`, { function: 'LanguageModel.initWorker' });
    try {
      this.llmWorker = await spawn<LLMWorker>(new Worker(workerURL as string), { timeout: 1000 * 30 });
      logger.debug(`initial llmWorker done`, { function: 'LanguageModel.initWorker' });
    } catch (error) {
      if ((error as Error).message.includes('Did not receive an init message from worker after')) {
        // https://github.com/andywer/threads.js/issues/426
        // wait some time and restart the wiki will solve this
        logger.warn(`initWorker() handle "${(error as Error)?.message}", will try recreate worker.`, { function: 'LanguageModel.initWorker' });
        await this.initWorker();
      } else {
        logger.warn('initWorker() unexpected error, throw it', { function: 'LanguageModel.initWorker' });
        throw error;
      }
    }
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

  public runLanguageModel$(runner: LanguageModelRunner.llamaCpp, options: IRunLLAmaOptions): Observable<ILLMResultPart>;
  public runLanguageModel$(runner: LanguageModelRunner.rwkvCpp, options: IRunRwkvOptions): Observable<ILLMResultPart>;
  public runLanguageModel$(runner: LanguageModelRunner, options: IRunLLAmaOptions | IRunRwkvOptions): Observable<ILLMResultPart> {
    const { id: conversationID, completionOptions, modelName, loadConfig: config } = options;
    return new Observable<ILLMResultPart>((subscriber) => {
      const runLanguageModelObserverIIFE = async () => {
        const worker = await this.getWorker();
        const { defaultModel } = await this.preferenceService.get('languageModel');
        const modelPath = path.join(LANGUAGE_MODEL_FOLDER, modelName ?? defaultModel[runner]);
        if (!(await this.checkModelExistsAndWarnUser(modelPath))) {
          subscriber.error(new Error(`${i18n.t('LanguageModel.ModelNotExist')} ${modelPath}`));
          return;
        }
        let observable;
        const texts = { timeout: i18n.t('LanguageModel.GenerationTimeout') };
        switch (runner) {
          case LanguageModelRunner.llamaCpp: {
            observable = worker.runLLama({ completionOptions, loadConfig: { modelPath, ...config }, conversationID }, texts);
            break;
          }
          case LanguageModelRunner.rwkvCpp: {
            observable = worker.runRwkv({ completionOptions, loadConfig: { modelPath, tokenizerPath: RWKV_CPP_TOKENIZER_PATH, ...config }, conversationID }, texts);
            break;
          }
          case LanguageModelRunner.llmRs: {
            logger.error(`llmRs haven't implemented yet.`);
            return;
          }
        }
        observable.subscribe({
          next: (result) => {
            const loggerCommonMeta = { id: result.id, function: 'LanguageModel.runLanguageModel$' };

            if ('type' in result && result.type === 'result') {
              const { token, id } = result;
              // prevent the case that the result is from previous or next conversation, where its Observable is not properly closed.
              if (id === conversationID) {
                subscriber.next({ token, id });
              }
            } else if ('level' in result) {
              logger.log(result.level, `${result.message}`, loggerCommonMeta);
            }
          },
          error: (error) => {
            logger.error(`${(error as Error).message} ${(error as Error).stack ?? 'no stack'}`, { id: conversationID, function: 'LanguageModel.runLanguageModel$.error' });
            subscriber.error(error);
          },
          complete: () => {
            logger.info(`worker observable completed`, { function: 'LanguageModel.runLanguageModel$.complete' });
            subscriber.complete();
          },
        });
      };
      void runLanguageModelObserverIIFE();
    });
  }

  public async abortLanguageModel(runner: LanguageModelRunner, id: string): Promise<void> {
    switch (runner) {
      case LanguageModelRunner.llamaCpp: {
        await this.llmWorker?.abortLLama(id);
        break;
      }
      case LanguageModelRunner.rwkvCpp: {
        await this.llmWorker?.abortRwkv(id);
        break;
      }
      case LanguageModelRunner.llmRs: {
        logger.error(`llmRs haven't implemented yet.`);
      }
    }
  }
}
