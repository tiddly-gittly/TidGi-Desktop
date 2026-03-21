/** Shared data-only types for process diagnostics, safe to import in both main and renderer. */

export interface IRendererProcessInfo {
  pid: number;
  title: string;
  type: string;
  url: string;
  isDestroyed: boolean;
}

export interface IProcessInfo {
  mainNode: {
    pid: number;
    title: string;
    rss_MB: number;
    heapUsed_MB: number;
    heapTotal_MB: number;
    external_MB: number;
  };
  renderers: IRendererProcessInfo[];
}
