import { useEffect, useState, useCallback, Dispatch } from 'react';
import { AsyncReturnType } from 'type-fest';
import { useDebouncedFn } from 'beautiful-react-hooks';

/**
 * Use value from service, especially constant value that never changes
 * This will only update once, won't listen on later update.
 * @param valuePromise A promise contain the value we want to use in React
 * @param defaultValue empty array or undefined, as initial value
 */
export function usePromiseValue<T, DefaultValueType = T | undefined>(
  asyncValue: () => Promise<T>,
  defaultValue?: AsyncReturnType<typeof asyncValue>,
  dependency: unknown[] = [],
): T | DefaultValueType {
  const [value, valueSetter] = useState<T | DefaultValueType>(defaultValue as T | DefaultValueType);
  // use initial value
  useEffect(() => {
    void (async () => {
      valueSetter(await asyncValue());
    })();
  }, dependency);

  return value;
}

export function usePromiseValueAndSetter<T, DefaultValueType = T | undefined>(
  asyncValue: () => Promise<T>,
  asyncSetter: (newValue: T | DefaultValueType) => Promise<unknown>,
  defaultValue?: AsyncReturnType<typeof asyncValue>,
): [T | DefaultValueType, (newValue: T | DefaultValueType) => void] {
  const [value, valueSetter] = useState<T | DefaultValueType>(defaultValue as T | DefaultValueType);
  // use initial value
  useEffect(() => {
    void (async () => {
      valueSetter(await asyncValue());
    })();
  }, [asyncValue]);
  // update remote value on change
  const updateRemoteValue = useDebouncedFn(
    async (newValue: T | DefaultValueType) => {
      const previousValue = await asyncValue();
      if (value !== previousValue) {
        void asyncSetter(value);
      }
    },
    300,
    undefined,
    [asyncValue, asyncSetter],
  );

  const setter = useCallback(
    async (newValue: T | DefaultValueType) => {
      valueSetter(newValue);
      await updateRemoteValue(newValue);
    },
    [valueSetter, updateRemoteValue],
  );

  return [value, setter];
}
