import ProcessInput from 'noflo/lib/ProcessInput';

/**
 * Treat values set in the NodeDetailPanel UI as default value.
 *
 * So we need a way in the component to know if value is passed from connected component or from initial packet, if it is from connected component then it won't be replayed, if it is from initial packet, then it is saved and used as default value, which can be overwrite by IP passed from connected component.
 */
export function getDataOrDefault<T>(key: string, input: ProcessInput, defaultValues: Record<string, unknown> = {}): T | undefined {
  const ip = input.get(key);
  if (ip === null || ip === undefined) {
    return defaultValues[key] as T;
  }
  if (Array.isArray(ip)) {
    // TODO: handle array, why will this be an array of IP?
    return defaultValues[key] as T;
  }
  if (ip.initial) {
    defaultValues[key] = ip.data;
    return defaultValues[key] as T;
  }
  return ip.data as T ?? defaultValues[key] as T;
}
