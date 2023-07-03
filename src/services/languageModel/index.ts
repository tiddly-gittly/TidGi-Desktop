import { inject, injectable } from 'inversify';
import { ModuleThread, spawn, Worker } from 'threads';

import type { INativeService } from '@services/native/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { Observable } from 'rxjs';
import { ILanguageModelService, ILLMResultPart } from './interface';
import { LLMWorker } from './llmWorker';

import { LOCAL_GIT_DIRECTORY } from '@/constants/appPaths';
import { lazyInject } from '@services/container';
// @ts-expect-error it don't want .ts
// eslint-disable-next-line import/no-webpack-loader-syntax
import workerURL from 'threads-plugin/dist/loader?name=llmWorker!./llmWorker.ts';

@injectable()
export class LanguageModel implements ILanguageModelService {
  @lazyInject(serviceIdentifier.NativeService)
  private readonly nativeService!: INativeService;

  constructor(@inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService) {
    void this.initWorker();
  }

  private llmWorker?: ModuleThread<LLMWorker>;

  private async initWorker(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.llmWorker = await spawn<LLMWorker>(new Worker(workerURL), { timeout: 1000 * 60 });
  }

  public runLLama$(): Observable<ILLMResultPart> {
    return new Observable((observer) => {
      const getWikiChangeObserverIIFE = async () => {
        const worker = await this.getWorkerEnsure(workspaceID);
        const observable = worker.getWikiChangeObserver();
        observable.subscribe(observer);
      };
      void getWikiChangeObserverIIFE();
    });
  }
}
