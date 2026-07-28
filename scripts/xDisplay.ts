export function requiresVirtualXDisplay(platform: NodeJS.Platform, hasDisplay: boolean): boolean {
  return platform === 'linux' && !hasDisplay;
}
