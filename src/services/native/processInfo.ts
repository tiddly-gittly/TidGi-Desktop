/** Shared data-only types for process diagnostics, safe to import in both main and renderer. */

export interface IRendererProcessInfo {
  pid: number;
  title: string;
  type: string;
  url: string;
  isDestroyed: boolean;
  /** Private (non-shared) memory in KB. Windows only; -1 on other platforms. */
  private_KB: number;
  /** Working set size (physical RAM pages) in KB. */
  workingSet_KB: number;
  /** CPU usage percentage at the time of the snapshot (0–100+). */
  cpu_percent: number;
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
