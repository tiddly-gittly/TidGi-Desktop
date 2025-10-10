import { app } from 'electron';
import { injectable } from 'inversify';
import { BehaviorSubject } from 'rxjs';
import type { ISystemPreferenceService, IUsedElectionSettings } from './interface';

@injectable()
export class SystemPreference implements ISystemPreferenceService {
  public systemPreference$: BehaviorSubject<IUsedElectionSettings>;

  constructor() {
    this.systemPreference$ = new BehaviorSubject<IUsedElectionSettings>({ openAtLogin: 'no' });
    void this.updatePreferenceSubject();
  }

  private async updatePreferenceSubject(): Promise<void> {
    this.systemPreference$.next(await this.getSystemPreferences());
  }

  public async get<K extends keyof IUsedElectionSettings>(key: K): Promise<IUsedElectionSettings[K]> {
    switch (key) {
      case 'openAtLogin': {
        // return our custom setting enum, to be cross-platform
        const loginItemSettings = app.getLoginItemSettings();
        const { openAtLogin } = loginItemSettings;
        // openAsHidden may be present on some platforms; access it safely without using `any`.
        const openAsHidden = (loginItemSettings as unknown as { openAsHidden?: boolean }).openAsHidden === true;
        if (openAtLogin && openAsHidden) return 'yes-hidden';
        if (openAtLogin) return 'yes';
        return 'no';
      }
      default: {
        throw new Error(`Try to get ${key} in SystemPreference, but it is not existed`);
      }
    }
  }

  public async getSystemPreferences(): Promise<IUsedElectionSettings> {
    return {
      openAtLogin: await this.get('openAtLogin'),
    };
  }

  public async setSystemPreference<K extends keyof IUsedElectionSettings>(key: K, value: IUsedElectionSettings[K]): Promise<void> {
    switch (key) {
      case 'openAtLogin': {
        app.setLoginItemSettings({
          openAtLogin: value.startsWith('yes'),
          // MacOS Only

          openAsHidden: value === 'yes-hidden',
        });
        break;
      }
      default: {
        break;
      }
    }
    await this.updatePreferenceSubject();
  }
}
