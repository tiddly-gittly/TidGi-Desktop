import { describe, expect, it } from 'vitest';
import { getLocalAdHocMacSigningPackagerConfig } from '../../forge.config';

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
