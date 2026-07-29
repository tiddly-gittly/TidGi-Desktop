import { defaultPreferences } from '@services/preferences/defaultPreferences';
import { createNetworkProxyEnvironment, resolveNetworkProxy } from '@services/preferences/networkProxy';
import { describe, expect, it } from 'vitest';

describe('network proxy resolution', () => {
  it('inherits the default proxy for targets configured to use it', () => {
    const preferences = {
      ...defaultPreferences,
      networkProxies: {
        ...defaultPreferences.networkProxies,
        default: { url: 'http://127.0.0.1:8080' },
        git: { useDefault: true, url: 'http://ignored.invalid:9000' },
      },
    };

    expect(resolveNetworkProxy(preferences, 'git')).toBe('http://127.0.0.1:8080');
  });

  it('uses a component-specific proxy when inheritance is disabled', () => {
    const preferences = {
      ...defaultPreferences,
      networkProxies: {
        ...defaultPreferences.networkProxies,
        wikiBackend: { useDefault: false, url: 'socks5://127.0.0.1:1080' },
      },
    };

    expect(resolveNetworkProxy(preferences, 'wikiBackend')).toBe('socks5://127.0.0.1:1080');
  });

  it('removes inherited proxy variables for a direct target', () => {
    const environment = createNetworkProxyEnvironment(defaultPreferences, 'wikiBackend', {
      PATH: 'test-path',
      HTTP_PROXY: 'http://inherited.invalid:8080',
      https_proxy: 'http://inherited.invalid:8080',
      NODE_USE_ENV_PROXY: '1',
    });

    expect(environment).toEqual({ PATH: 'test-path' });
  });

  it('sets both Node and Git-compatible proxy variables', () => {
    const preferences = {
      ...defaultPreferences,
      networkProxies: {
        ...defaultPreferences.networkProxies,
        default: { url: 'http://127.0.0.1:8080' },
      },
    };
    const environment = createNetworkProxyEnvironment(preferences, 'git', { PATH: 'test-path' });

    expect(environment.NODE_USE_ENV_PROXY).toBe('1');
    expect(environment.HTTP_PROXY).toBe('http://127.0.0.1:8080');
    expect(environment.http_proxy).toBe('http://127.0.0.1:8080');
    expect(environment.NO_PROXY).toBe('');
    expect(environment.GIT_CONFIG_KEY_0).toBe('http.proxy');
    expect(environment.GIT_CONFIG_VALUE_0).toBe('http://127.0.0.1:8080');
  });

  it('overrides a global Git proxy when the Git target is direct', () => {
    const environment = createNetworkProxyEnvironment(defaultPreferences, 'git', {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'unrelated.inherited.key',
      GIT_CONFIG_VALUE_0: 'inherited',
    });

    expect(environment.GIT_CONFIG_COUNT).toBeUndefined();
    expect(environment.GIT_CONFIG_KEY_0).toBeUndefined();
    expect(environment.GIT_CONFIG_VALUE_0).toBeUndefined();
    expect(environment.NO_PROXY).toBe('*');
    expect(environment.no_proxy).toBe('*');
  });
});
