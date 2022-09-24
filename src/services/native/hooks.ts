/* eslint-disable unicorn/no-useless-undefined */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { usePromiseValue } from '@/helpers/useServiceValue';

export function useActualIp(homeUrl: string): string | undefined {
  return usePromiseValue<string | undefined, undefined>(
    async () => (homeUrl ? await window.service.native.getLocalHostUrlWithActualIP(homeUrl) : await Promise.resolve(undefined)),
    undefined,
    [homeUrl],
  );
}
