import { usePromiseValue } from '@/helpers/useServiceValue';

export function useActualIp(homeUrl?: string, workspaceID?: string): string | undefined {
  return usePromiseValue<string | undefined>(
    async (): Promise<string | undefined> => {
      return homeUrl && workspaceID ? await window.service.native.getLocalHostUrlWithActualInfo(homeUrl, workspaceID) : undefined;
    },
    undefined,
    [homeUrl, workspaceID],
  );
}
