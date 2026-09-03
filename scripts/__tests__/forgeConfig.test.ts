import { describe, expect, it } from 'vitest';
import forgeConfig, { getLocalAdHocMacSigningPackagerConfig } from '../../forge.config';
import { rendererAliases, rendererDedupe } from '../../vite.renderer.aliases';

describe('getLocalAdHocMacSigningPackagerConfig', () => {
  it.each([undefined, '', '0', 'true'])('keeps signing absent unless the local-only switch is exactly 1 (%s)', value => {
    const configuration = getLocalAdHocMacSigningPackagerConfig({ TIDGI_LOCAL_ADHOC_SIGN: value });

    expect(configuration).toEqual({});
    expect(configuration).not.toHaveProperty('osxSign');
  });

  it('uses the local ad-hoc identity without certificate discovery or release hardening', () => {
    const configuration = getLocalAdHocMacSigningPackagerConfig({ TIDGI_LOCAL_ADHOC_SIGN: '1' });

    expect(configuration).toMatchObject({
      osxSign: {
        identity: '-',
        identityValidation: false,
        preAutoEntitlements: false,
      },
    });
    expect(configuration.osxSign).not.toBe(true);
    if (configuration.osxSign === undefined || configuration.osxSign === true) throw new Error('expected local ad-hoc signing options');
    expect(configuration.osxSign.optionsForFile?.('/tmp/TidGi.app')).toEqual({
      hardenedRuntime: false,
      timestamp: 'none',
    });
  });
});

describe('packaged utility process files', () => {
  it('unpacks Forge Vite JS chunks and native modules outside asar', () => {
    const asar = forgeConfig.packagerConfig?.asar;
    const unpack = typeof asar === 'object' && asar !== null ? asar.unpack : undefined;

    expect(unpack).toEqual(expect.stringContaining('**/.vite/build/**/*.js'));
    expect(unpack).toEqual(expect.stringContaining('*.node'));
    expect(unpack).not.toEqual(expect.stringContaining('**/.webpack/main'));
  });
});

describe('renderer package entry aliases', () => {
  it('keeps MemeLoop agent subpath exports distinct from the agent root', () => {
    const matchingAliases = (specifier: string) =>
      rendererAliases.filter(alias => {
        const matcher = alias.find;
        return typeof matcher === 'string' ? matcher === specifier : matcher.test(specifier);
      });

    expect(matchingAliases('@memeloop/react-ui/agent')).toHaveLength(1);
    expect(matchingAliases('@memeloop/react-ui/agent/prompts')).toHaveLength(1);
    expect(matchingAliases('@memeloop/react-ui/agent/scheduling')).toHaveLength(1);
  });

  it('forces the cron editor through ESM and a single React dispatcher', () => {
    const cronAliases = rendererAliases.filter(alias => {
      const matcher = alias.find;
      return typeof matcher === 'string' ? matcher === 'material-ui-cron' : matcher.test('material-ui-cron');
    });

    expect(cronAliases).toHaveLength(1);
    expect(cronAliases[0]?.replacement).toMatch(/material-ui-cron\/dist\/index\.esm\.js$/u);
    expect(rendererDedupe).toEqual(['react', 'react-dom']);
  });
});
