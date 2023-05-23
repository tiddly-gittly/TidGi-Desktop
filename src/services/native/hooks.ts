/* eslint-disable unicorn/no-useless-undefined */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { usePromiseValue } from '@/helpers/useServiceValue';

export function useActualIp(homeUrl?: string, workspaceID?: string): string | undefined {
  return usePromiseValue<string | undefined, undefined>(
    async (): Promise<string | undefined> => {
      return homeUrl && workspaceID ? await window.service.native.getLocalHostUrlWithActualInfo(homeUrl, workspaceID) : void Promise.resolve(undefined);
    },
    undefined,
    [homeUrl, workspaceID],
  );
}
