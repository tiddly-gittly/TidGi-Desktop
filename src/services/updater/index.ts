/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { shell } from 'electron';
import i18next from 'i18next';
import { injectable } from 'inversify';
import fetch from 'node-fetch';
import { BehaviorSubject } from 'rxjs';
import semver from 'semver';

import { lazyInject } from '@services/container';
import { IContextService } from '@services/context/interface';
import { logger } from '@services/libs/log';
import type { IMenuService } from '@services/menu/interface';
import { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IGithubReleaseData, IUpdaterMetaData, IUpdaterService, IUpdaterStatus } from './interface';

// TODO: use electron-forge 's auto update solution， maybe see https://headspring.com/2020/09/24/building-signing-and-publishing-electron-forge-applications-for-windows/
@injectable()
export class Updater implements IUpdaterService {
  @lazyInject(serviceIdentifier.MenuService)
  private readonly menuService!: IMenuService;

  @lazyInject(serviceIdentifier.Context)
  private readonly contextService!: IContextService;

  @lazyInject(serviceIdentifier.Preference)
  private readonly preferenceService!: IPreferenceService;

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
    let latestReleasePageUrl: string;
    const allowPrerelease = await this.preferenceService.get('allowPrerelease');
    try {
      const latestReleaseData = await (allowPrerelease
        ? fetch('https://api.github.com/repos/tiddly-gittly/TidGi-Desktop/releases?per_page=1')
          .then(async (response) => await (response.json() as Promise<IGithubReleaseData[]>))
          .then((json) => json[0])
        : fetch('https://api.github.com/repos/tiddly-gittly/TidGi-Desktop/releases/latest').then(
          async (response) => await (response.json() as Promise<IGithubReleaseData | undefined>),
        ));
      if (latestReleaseData === undefined) {
        throw new Error('No release data, latestReleaseData === undefined');
      }
      latestVersion = latestReleaseData.tag_name.replace('v', '');
      latestReleasePageUrl = latestReleaseData.html_url;
    } catch (fetchError) {
      logger.error('Fetching latest release failed', { fetchError });
      this.setMetaData({ status: IUpdaterStatus.checkingFailed, info: { errorMessage: (fetchError as Error).message } });
      await this.menuService.insertMenu('TidGi', [
        {
          id: 'update',
          label: () => i18next.t('Updater.CheckingFailed'),
          click: async () => {
            await this.checkForUpdates();
          },
        },
      ]);
      return;
    }
    logger.debug('Get release data', { latestVersion });
    const currentVersion = await this.contextService.get('appVersion');
    const isLatestRelease = semver.gt(latestVersion, currentVersion);
    logger.debug('Compare version', { currentVersion, isLatestRelease });
    if (isLatestRelease) {
      this.setMetaData({ status: IUpdaterStatus.updateAvailable, info: { version: latestVersion, latestReleasePageUrl } });
      await this.menuService.insertMenu('TidGi', [
        {
          id: 'update',
          label: () => i18next.t('Updater.UpdateAvailable'),
          click: async () => {
            await shell.openExternal(latestReleasePageUrl);
          },
        },
      ]);
    } else {
      this.setMetaData({ status: IUpdaterStatus.updateNotAvailable, info: { version: latestVersion } });
      await this.menuService.insertMenu('TidGi', [
        {
          id: 'update',
          label: () => i18next.t('Updater.UpdateNotAvailable'),
          click: async () => {
            await this.checkForUpdates();
          },
        },
      ]);
    }
  }
}
