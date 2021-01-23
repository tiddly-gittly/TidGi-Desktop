import { SystemPreferenceChannel } from '@/constants/channels';
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';

export interface IUsedElectionSettings {
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
