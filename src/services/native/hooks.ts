/* eslint-disable unicorn/no-useless-undefined */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { usePromiseValue } from '@/helpers/useServiceValue';

export function useActualIp(homeUrl: string): string | undefined {
  return usePromiseValue<string | undefined, undefined>(
    async (): Promise<string | undefined> => {
      return homeUrl ? await window.service.native.getLocalHostUrlWithActualIP(homeUrl) : void Promise.resolve(undefined);
    },
    undefined,
    [homeUrl],
  );
}
