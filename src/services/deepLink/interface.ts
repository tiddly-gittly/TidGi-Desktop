import { ProxyPropertyType } from 'electron-ipc-cat/common';

export interface IDeepLinkService {
  /**
   * Initialize deep link service.
   * @param protocol The protocol to be used for deep linking.
   */
  initializeDeepLink(protocol: string): void;
  /**
   * Process any pending deep link after workspaces are initialized.
   * Should be called after all workspaces are ready.
   */
  processPendingDeepLink(): Promise<void>;
}

export const DeepLinkServiceIPCDescriptor = {
  channel: 'DeepLinkChannel',
  properties: {
    initializeDeepLink: ProxyPropertyType.Function,
    processPendingDeepLink: ProxyPropertyType.Function,
  },
};
