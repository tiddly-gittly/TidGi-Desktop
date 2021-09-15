import { SystemPreferenceChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { BehaviorSubject } from 'rxjs';

export interface IUsedElectionSettings {
  openAtLogin: 'yes-hidden' | 'yes' | 'no';
}

/**
 * System Preferences are not stored in storage but stored in macOS Preferences.
 * It can be retrieved and changed using Electron APIs
 */
export interface ISystemPreferenceService {
  get<K extends keyof IUsedElectionSettings>(key: K): Promise<IUsedElectionSettings[K]>;
  getSystemPreferences(): Promise<IUsedElectionSettings>;
  setSystemPreference<K extends keyof IUsedElectionSettings>(key: K, value: IUsedElectionSettings[K]): Promise<void>;
  systemPreference$: BehaviorSubject<IUsedElectionSettings>;
}
export const SystemPreferenceServiceIPCDescriptor = {
  channel: SystemPreferenceChannel.name,
  properties: {
    systemPreference$: ProxyPropertyType.Value$,
    get: ProxyPropertyType.Function,
    getPreferences: ProxyPropertyType.Function,
    setSystemPreference: ProxyPropertyType.Function,
  },
};
