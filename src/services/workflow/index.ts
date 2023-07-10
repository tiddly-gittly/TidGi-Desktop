import { dialog } from 'electron';
import fs from 'fs-extra';
import { injectable } from 'inversify';
import path from 'path';
import { Observable } from 'rxjs';
import { ModuleThread, spawn, Worker } from 'threads';

// @ts-expect-error it don't want .ts
// eslint-disable-next-line import/no-webpack-loader-syntax
import workerURL from 'threads-plugin/dist/loader?name=workflowWorker!./workflowWorker.ts';

import { LANGUAGE_MODEL_FOLDER } from '@/constants/appPaths';
import { getExistingParentDirectory } from '@/helpers/findPath';
import { lazyInject } from '@services/container';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import type { INativeService } from '@services/native/interface';
import { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { IWorkflowService, ILLMResultPart, ICreateRuntimeOptions } from './interface';
import { WorkflowWorker } from './workflowWorker';

@injectable()
export class Workflow implements IWorkflowService {
  @lazyInject(serviceIdentifier.NativeService)
  private readonly nativeService!: INativeService;

  @lazyInject(serviceIdentifier.Window)
  private readonly windowService!: IWindowService;

  @lazyInject(serviceIdentifier.Preference)
  private readonly preferenceService!: IPreferenceService;

  private workflowWorker?: ModuleThread<WorkflowWorker>;

  private async initWorker(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.workflowWorker = await spawn<WorkflowWorker>(new Worker(workerURL), { timeout: 1000 * 60 });
  }

  /**
   * Ensure you get a started worker. If not stated, it will await for it to start.
   * @param workspaceID
   */
  private async getWorker(): Promise<ModuleThread<WorkflowWorker>> {
    if (this.workflowWorker === undefined) {
      await this.initWorker();
    } else {
      return this.workflowWorker;
    }
    if (this.workflowWorker === undefined) {
      const errorMessage = `Still no workflowWorker after init. No running worker, maybe worker failed to start`;
      logger.error(
        errorMessage,
        {
          function: 'callWikiIpcServerRoute',
        },
      );
      throw new Error(errorMessage);
    }
    return this.workflowWorker;
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
            title: i18n.t('Workflow.ModelNotExist'),
            message: `${i18n.t('Workflow.ModelNotExistDescription')}: ${modelPath}`,
            buttons: ['OK', i18n.t('Workflow.OpenThisPath')],
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

  public runLLama$(options: ICreateRuntimeOptions): Observable<ILLMResultPart> {
    const { id: conversationID, prompt, modelName } = options;
    return new Observable<ILLMResultPart>((subscriber) => {
      const getWikiChangeObserverIIFE = async () => {
        const worker = await this.getWorker();

        //         const template = `Write a short helloworld in JavaScript.`;
        //         const prompt = `A chat between a user and a useful assistant.
        // USER: ${template}
        // ASSISTANT:`;
        const { defaultModel } = await this.preferenceService.get('workflow');
        const modelPath = path.join(LANGUAGE_MODEL_FOLDER, modelName ?? defaultModel['llama.cpp']);
        if (!(await this.checkModelExistsAndWarnUser(modelPath))) {
          subscriber.error(new Error(`${i18n.t('Workflow.ModelNotExist')} ${modelPath}`));
          return;
        }
        const observable = worker.runLLama$({ prompt, modelPath, conversationID });
        observable.subscribe({
          next: (result) => {
            const loggerCommonMeta = { id: result.id, function: 'Workflow.runLLama$' };

            if ('type' in result && result.type === 'result') {
              const { token, id } = result;
              // prevent the case that the result is from previous or next conversation, where its Observable is not properly closed.
              if (id === conversationID) {
                subscriber.next({ token, id });
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
            subscriber.error(error);
          },
          complete: () => {
            logger.info(`worker observable completed`, { function: 'Workflow.runLLama$' });
            subscriber.complete();
          },
        });
      };
      void getWikiChangeObserverIIFE();
    });
  }
}
