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

export function useActualIps(homeUrl?: string, workspaceID?: string): string[] | undefined {
  return usePromiseValue<string[]>(
    async (): Promise<string[]> => {
      return homeUrl && workspaceID ? await window.service.native.getAllLocalHostUrlsWithActualInfo(homeUrl, workspaceID) : [];
    },
    [],
    [homeUrl, workspaceID],
  );
}
