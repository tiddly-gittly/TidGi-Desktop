import { isEqual, isObject } from 'lodash';

/**
 * Extract differences between configurations, keeping only parts that differ from the base config
 * When a field in currentConfig becomes the same as baseConfig or is explicitly set to undefined,
 * it will be removed from the result to indicate it should use the parent config value
 * @param currentConfig Current configuration
 * @param baseConfig Base configuration to compare against
 * @returns Partial configuration containing only differences
 */
export const getDiffConfig = <T extends Record<string, unknown>>(currentConfig: T, baseConfig: T | null): Partial<T> => {
  if (!baseConfig) return currentConfig;

  // Custom merge function to identify different values
  const diffObject: Partial<T> = {};

  // Recursive comparison function
  const compareAndExtractDiff = (current: Record<string, unknown>, base: Record<string, unknown>, result: Record<string, unknown>, path: string[] = []): void => {
    // Get all keys from both objects
    const allKeys = new Set([
      ...Object.keys(current),
      ...Object.keys(base),
    ]);

    for (const key of allKeys) {
      const currentValue = current[key];
      const baseValue = base[key];

      // Keys not in base - keep them
      if (!(key in base)) {
        if (path.length === 0) {
          result[key] = currentValue;
        } else {
          // Ensure objects exist along the path
          let target = result;
          for (let index = 0; index < path.length; index++) {
            const pathKey = path[index];
            if (!target[pathKey]) {
              target[pathKey] = {};
            }
            target = target[pathKey] as Record<string, unknown>;
          }
          target[key] = currentValue;
        }
        continue;
      }

      // Keys in current that are explicitly set to undefined - keep them
      // to indicate they should override parent values
      if ((key in current) && currentValue === undefined) {
        if (path.length === 0) {
          result[key] = undefined;
        } else {
          // Ensure objects exist along the path
          let target = result;
          for (let index = 0; index < path.length; index++) {
            const pathKey = path[index];
            if (!target[pathKey]) {
              target[pathKey] = {};
            }
            target = target[pathKey] as Record<string, unknown>;
          }
          target[key] = undefined;
        }
        continue;
      }

      // Keys not in current - ignore
      if (!(key in current)) {
        continue;
      }

      // Values differ
      if (!isEqual(currentValue, baseValue)) {
        // If both are objects (but not arrays), compare recursively
        if (isObject(currentValue) && isObject(baseValue) && !Array.isArray(currentValue) && !Array.isArray(baseValue)) {
          compareAndExtractDiff(
            currentValue as Record<string, unknown>,
            baseValue as Record<string, unknown>,
            result,
            [...path, key],
          );
        } else {
          // For primitive types, arrays, or different types, record difference directly
          if (path.length === 0) {
            result[key] = currentValue;
          } else {
            // Ensure objects exist along the path
            let target = result;
            for (let index = 0; index < path.length; index++) {
              const pathKey = path[index];
              if (!target[pathKey]) {
                target[pathKey] = {};
              }
              target = target[pathKey] as Record<string, unknown>;
            }
            target[key] = currentValue;
          }
        }
      }
      // Note: if values are equal, we don't add them to the result
      // which effectively removes fields that match the parent config
    }
  };

  compareAndExtractDiff(currentConfig, baseConfig, diffObject);
  return diffObject;
};
