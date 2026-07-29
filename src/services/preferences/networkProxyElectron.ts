import type { Session } from 'electron';
import type { IPreferences, NetworkProxyTarget } from './interface';
import { resolveNetworkProxy } from './networkProxy';

export async function applyNetworkProxyToSession(
  targetSession: Session,
  preferences: Pick<IPreferences, 'networkProxies'>,
  target: NetworkProxyTarget,
): Promise<void> {
  const proxyRules = resolveNetworkProxy(preferences, target);
  if (proxyRules) {
    await targetSession.setProxy({ mode: 'fixed_servers', proxyRules });
  } else {
    await targetSession.setProxy({ mode: 'direct' });
  }
}
