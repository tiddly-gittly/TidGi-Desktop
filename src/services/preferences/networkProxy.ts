import type { IPreferences, NetworkProxyTarget } from './interface';

const PROXY_ENVIRONMENT_KEYS = [
  'ALL_PROXY',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'all_proxy',
  'http_proxy',
  'https_proxy',
  'no_proxy',
] as const;

export function resolveNetworkProxy(preferences: Pick<IPreferences, 'networkProxies'>, target: NetworkProxyTarget): string {
  const configuration = preferences.networkProxies[target];
  if (target !== 'default' && 'useDefault' in configuration && configuration.useDefault) {
    return preferences.networkProxies.default.url.trim();
  }
  return configuration.url.trim();
}

/**
 * Build a complete child-process environment so inherited OS proxy settings
 * cannot silently override an explicit "direct" TidGi configuration.
 */
export function createNetworkProxyEnvironment(
  preferences: Pick<IPreferences, 'networkProxies'>,
  target: NetworkProxyTarget,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const environment = Object.fromEntries(
    Object.entries(baseEnvironment).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  for (const key of PROXY_ENVIRONMENT_KEYS) {
    delete environment[key];
  }
  if (target === 'git') {
    for (const key of Object.keys(environment)) {
      if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(key)) {
        delete environment[key];
      }
    }
  }

  const proxy = resolveNetworkProxy(preferences, target);
  if (proxy) {
    environment.NODE_USE_ENV_PROXY = '1';
    environment.HTTP_PROXY = proxy;
    environment.HTTPS_PROXY = proxy;
    environment.ALL_PROXY = proxy;
    environment.http_proxy = proxy;
    environment.https_proxy = proxy;
    environment.all_proxy = proxy;
    environment.NO_PROXY = '';
    environment.no_proxy = '';
  } else {
    delete environment.NODE_USE_ENV_PROXY;
  }
  if (target === 'git') {
    // Command-scoped config has higher priority than a user's global Git
    // http.proxy and also lets an explicit direct setting clear that proxy.
    environment.GIT_CONFIG_COUNT = '1';
    environment.GIT_CONFIG_KEY_0 = 'http.proxy';
    environment.GIT_CONFIG_VALUE_0 = proxy;
  }
  return environment;
}
