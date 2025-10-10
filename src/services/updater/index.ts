import { shell } from 'electron';
import i18next from 'i18next';
import { inject, injectable } from 'inversify';
import fetch from 'node-fetch';
import { BehaviorSubject } from 'rxjs';
import semver from 'semver';

import { container } from '@services/container';
import type { IContextService } from '@services/context/interface';
import { logger } from '@services/libs/log';
import type { IMenuService } from '@services/menu/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IGithubReleaseData, IUpdaterMetaData, IUpdaterService } from './interface';
import { IUpdaterStatus } from './interface';

// TODO: use electron-forge 's auto update solution， maybe see https://headspring.com/2020/09/24/building-signing-and-publishing-electron-forge-applications-for-windows/
@injectable()
export class Updater implements IUpdaterService {
  private updaterMetaData = {} as IUpdaterMetaData;
  public updaterMetaData$: BehaviorSubject<IUpdaterMetaData>;

  constructor(
    @inject(serviceIdentifier.Context) private readonly contextService: IContextService,
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
  ) {
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
    const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
    void menuService.buildMenu();
  }

  public async checkForUpdates(): Promise<void> {
    logger.debug('Checking for updates...');
    this.setMetaData({ status: IUpdaterStatus.checkingForUpdate });
    const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
    await menuService.insertMenu('TidGi', [
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
      this.setMetaData({
        status: 'error' as IUpdaterStatus,
        info: { errorMessage: (fetchError as Error).message },
      });
      const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
      await menuService.insertMenu('TidGi', [
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
    /**
     * Note that vx.x.x-fix > vx.x.x, and this version is get from github tag, not from package.json, so make sure always bump version, otherwise user will always see "has new release"
     */
    const hasNewRelease = semver.gt(latestVersion, currentVersion);
    logger.debug('Compare version', { currentVersion, isLatestRelease: hasNewRelease });
    if (hasNewRelease) {
      this.setMetaData({ status: IUpdaterStatus.updateAvailable, info: { version: latestVersion, latestReleasePageUrl } });
      const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
      await menuService.insertMenu('TidGi', [
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
      const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
      await menuService.insertMenu('TidGi', [
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
