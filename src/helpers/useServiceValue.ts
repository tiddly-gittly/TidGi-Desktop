import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';
import { useCallback, useEffect, useState } from 'react';
import { AsyncReturnType } from 'type-fest';

/**
 * Use value from service, especially constant value that never changes
 * This will only update once, won't listen on later update.
 * @param valuePromise A promise contain the value we want to use in React
 * @param defaultValue empty array or undefined, as initial value
 */
export function usePromiseValue<T>(asyncValue: () => Promise<T>, defaultValue?: AsyncReturnType<typeof asyncValue>, dependency: unknown[] = []): T | (undefined) {
  const [value, valueSetter] = useState<T | (undefined)>(defaultValue as T | (undefined));
  // use initial value
  useEffect(() => {
    void (async () => {
      try {
        valueSetter(await asyncValue());
      } catch (_error: unknown) {
        console.warn('Service not available yet', _error);
        void _error;
        if (defaultValue !== undefined) {
          valueSetter(defaultValue);
        }
      }
    })();
  }, dependency);

  return value;
}

export function usePromiseValueAndSetter<T>(
  asyncValue: () => Promise<T>,
  asyncSetter: (newValue: T | (undefined)) => Promise<unknown>,
  defaultValue?: AsyncReturnType<typeof asyncValue>,
): [T | (undefined), (newValue: T | (undefined)) => void] {
  const [value, valueSetter] = useState<T | (undefined)>(defaultValue as T | (undefined));
  // use initial value
  useEffect(() => {
    void (async () => {
      valueSetter(await asyncValue());
    })();
  }, [asyncValue]);
  // update remote value on change
  const updateRemoteValue = useDebouncedCallback(
    async () => {
      const previousValue = await asyncValue();
      if (value !== previousValue) {
        void asyncSetter(value);
      }
    },
    [asyncValue, asyncSetter],
    300,
  );

  const setter = useCallback(
    async (newValue: T | (undefined)) => {
      valueSetter(newValue);
      await updateRemoteValue();
    },
    [valueSetter, updateRemoteValue],
  );

  return [value, setter];
}
