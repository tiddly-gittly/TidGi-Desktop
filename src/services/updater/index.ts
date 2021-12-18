/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { injectable } from 'inversify';
import semver from 'semver';
import { BehaviorSubject } from 'rxjs';
import i18next from 'i18next';
import { shell } from 'electron';
import fetch from 'node-fetch';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IWindowService } from '@services/windows/interface';
import { IContextService } from '@services/context/interface';
import { lazyInject } from '@services/container';
import { IUpdaterService, IUpdaterMetaData, IGithubReleaseData, IUpdaterStatus } from './interface';
import type { IMenuService } from '@services/menu/interface';
import { logger } from '@services/libs/log';

// TODO: use electron-forge 's auto update solution， maybe see https://headspring.com/2020/09/24/building-signing-and-publishing-electron-forge-applications-for-windows/
@injectable()
export class Updater implements IUpdaterService {
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;
  @lazyInject(serviceIdentifier.MenuService) private readonly menuService!: IMenuService;
  @lazyInject(serviceIdentifier.Context) private readonly contextService!: IContextService;

  private updaterMetaData = {} as IUpdaterMetaData;
  public updaterMetaData$: BehaviorSubject<IUpdaterMetaData>;

  public constructor() {
    this.updaterMetaData$ = new BehaviorSubject<IUpdaterMetaData>(this.updaterMetaData);
  }

  private updateUpdaterSubject(): void {
    this.updaterMetaData$.next(this.updaterMetaData);
  }

  private setMetaData(newUpdaterMetaData: IUpdaterMetaData): void {
    this.updaterMetaData = {
      ...this.updaterMetaData,
      ...newUpdaterMetaData,
    };
    this.updateUpdaterSubject();
    void this.menuService.buildMenu();
  }

  public async checkForUpdates(): Promise<void> {
    logger.debug('Checking for updates...');
    this.setMetaData({ status: IUpdaterStatus.checkingForUpdate });
    await this.menuService.insertMenu('TidGi', [
      {
        id: 'update',
        label: () => i18next.t('Updater.CheckingForUpdate'),
        enabled: false,
      },
    ]);
    let latestVersion: string;
    try {
      const latestReleaseData = await fetch('https://api.github.com/repos/tiddly-gittly/TidGi-Desktop/releases/latest').then(
        async (response) => await (response.json() as Promise<IGithubReleaseData>),
      );
      latestVersion = latestReleaseData.tag_name.replace('v', '');
    } catch (fetchError) {
      logger.error('Fetching latest release failed', { fetchError });
      this.setMetaData({ status: IUpdaterStatus.checkingFailed, info: { errorMessage: (fetchError as Error).message } });
      await this.menuService.insertMenu('TidGi', [
        {
          id: 'update',
          label: () => i18next.t('Updater.CheckingFailed'),
          click: async () => await this.checkForUpdates(),
        },
      ]);
      return;
    }
    logger.debug('Get release data', { latestVersion });
    const currentVersion = await this.contextService.get('appVersion');
    const isLatestRelease = semver.gt(latestVersion, currentVersion);
    logger.debug('Compare version', { currentVersion, isLatestRelease });
    if (isLatestRelease) {
      this.setMetaData({ status: IUpdaterStatus.updateAvailable, info: { version: latestVersion } });
      await this.menuService.insertMenu('TidGi', [
        {
          id: 'update',
          label: () => i18next.t('Updater.UpdateAvailable'),
          click: async () => await shell.openExternal('https://github.com/tiddly-gittly/TidGi-Desktop/releases/latest'),
        },
      ]);
    } else {
      this.setMetaData({ status: IUpdaterStatus.updateNotAvailable, info: { version: latestVersion } });
      await this.menuService.insertMenu('TidGi', [
        {
          id: 'update',
          label: () => i18next.t('Updater.UpdateNotAvailable'),
          click: async () => await this.checkForUpdates(),
        },
      ]);
    }
  }
}
