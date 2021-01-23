import { SystemPreferenceChannel } from '@/constants/channels';
import { app, ipcMain } from 'electron';
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { injectable } from 'inversify';

interface IUsedElectionSettings {
  openAtLogin: 'yes-hidden' | 'yes' | 'no';
}

/**
 * System Preferences are not stored in storage but stored in macOS Preferences.
 * It can be retrieved and changed using Electron APIs
 */
export interface ISystemPreferenceService {
  get<K extends keyof IUsedElectionSettings>(key: K): IUsedElectionSettings[K];
  getSystemPreferences(): IUsedElectionSettings;
  setSystemPreference<K extends keyof IUsedElectionSettings>(key: K, value: IUsedElectionSettings[K]): void;
}
export const SystemPreferenceServiceIPCDescriptor = {
  channel: SystemPreferenceChannel.name,
  properties: {
    set: ProxyPropertyType.Function,
    getPreferences: ProxyPropertyType.Function,
    get: ProxyPropertyType.Function,
    reset: ProxyPropertyType.Function,
  },
};
@injectable()
export class SystemPreference implements ISystemPreferenceService {
  constructor() {
    this.init();
  }

  private init(): void {
    ipcMain.handle('get-system-preference', (event, key: keyof IUsedElectionSettings) => {
      return this.get(key);
    });
    ipcMain.handle('get-system-preferences', (event) => {
      const preferences = this.getSystemPreferences();
      return preferences;
    });
    ipcMain.handle('request-set-system-preference', <K extends keyof IUsedElectionSettings>(_: unknown, key: K, value: IUsedElectionSettings[K]) => {
      this.setSystemPreference(key, value);
    });
  }

  public get<K extends keyof IUsedElectionSettings>(key: K): IUsedElectionSettings[K] {
    switch (key) {
      case 'openAtLogin': {
        // return our custom setting enum, to be cross-platform
        const loginItemSettings = app.getLoginItemSettings();
        const { openAtLogin, openAsHidden } = loginItemSettings;
        if (openAtLogin && openAsHidden) return 'yes-hidden';
        if (openAtLogin) return 'yes';
        return 'no';
      }
      default: {
        throw new Error(`Try to get ${key} in SystemPreference, but it is not existed`);
      }
    }
  }

  public getSystemPreferences(): IUsedElectionSettings {
    return {
      openAtLogin: this.get('openAtLogin'),
    };
  }

  public setSystemPreference<K extends keyof IUsedElectionSettings>(key: K, value: IUsedElectionSettings[K]): void {
    switch (key) {
      case 'openAtLogin': {
        app.setLoginItemSettings({
          openAtLogin: value.startsWith('yes'),
          openAsHidden: value === 'yes-hidden',
        });
        break;
      }
      default: {
        break;
      }
    }
    // TODO: sendToAllWindows?, maybe do this in the base class
    // sendToAllWindows('set-system-preference', name, value);
  }
}
