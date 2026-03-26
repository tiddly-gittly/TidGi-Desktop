import { ProxyPropertyType } from 'electron-ipc-cat/common';

import { PreferenceChannel } from '@/constants/channels';
import type { BehaviorSubject } from 'rxjs';

import type { IPreferences } from './zodSchema';
export type { IPreferences } from './zodSchema';

export enum PreferenceSections {
  developers = 'developers',
  downloads = 'downloads',
  friendLinks = 'friendLinks',
  general = 'general',
  languages = 'languages',
  tidgiMiniWindow = 'tidgiMiniWindow',
  misc = 'misc',
  network = 'network',
  notifications = 'notifications',
  performance = 'performance',
  privacy = 'privacy',
  search = 'search',
  sync = 'sync',
  system = 'system',
  updates = 'updates',
  wiki = 'wiki',
  externalAPI = 'externalAPI',
  aiAgent = 'aiAgent',
}

/**
 * Getter and setter for app business logic preferences.
 */
export interface IPreferenceService {
  get<K extends keyof IPreferences>(key: K): Promise<IPreferences[K]>;
  /**
   * get preferences, may return cached version
   */
  getPreferences(): IPreferences;
  /** Subscribable stream to get react component updated with latest preferences */
  preference$: BehaviorSubject<IPreferences | undefined>;
  reset(): Promise<void>;
  resetWithConfirm(): Promise<void>;
  /**
   * Update preferences, update cache and observable
   */
  set<K extends keyof IPreferences>(key: K, value: IPreferences[K]): Promise<void>;
  /**
   * Manually refresh the observable's content, that will be received by react component.
   */
  updatePreferenceSubject(): void;
}
export const PreferenceServiceIPCDescriptor = {
  channel: PreferenceChannel.name,
  properties: {
    preference$: ProxyPropertyType.Value$,
    set: ProxyPropertyType.Function,
    getPreferences: ProxyPropertyType.Function,
    get: ProxyPropertyType.Function,
    reset: ProxyPropertyType.Function,
    resetWithConfirm: ProxyPropertyType.Function,
    updatePreferenceSubject: ProxyPropertyType.Function,
  },
};
