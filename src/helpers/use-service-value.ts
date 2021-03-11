import { useEffect, useState, useCallback, Dispatch } from 'react';
import { AsyncReturnType } from 'type-fest';

/**
 * Use value from service, especially constant value that never changes
 * This will only update once, won't listen on later update.
 * @param valuePromise A promise contain the value we want to use in React
 * @param defaultValue empty array or undefined, as initial value
 */
export function usePromiseValue<T, DefaultValueType = T | undefined>(
  asyncValue: () => Promise<T>,
  defaultValue?: AsyncReturnType<typeof asyncValue>,
): T | DefaultValueType {
  const [value, valueSetter] = useState<T | DefaultValueType>(defaultValue as T | DefaultValueType);
  // use initial value
  useEffect(() => {
    void (async () => {
      valueSetter(await asyncValue());
    })();
  }, []);

  return value;
}

export function usePromiseValueAndSetter<T, DefaultValueType = T | undefined>(
  asyncValue: () => Promise<T>,
  asyncSetter: (newValue: T | DefaultValueType) => Promise<unknown>,
  defaultValue?: AsyncReturnType<typeof asyncValue>,
): [T | DefaultValueType, Dispatch<T | DefaultValueType>] {
  const cachedSetter = useCallback(asyncSetter, [asyncSetter]);
  const [value, valueSetter] = useState<T | DefaultValueType>(defaultValue as T | DefaultValueType);
  // use initial value
  useEffect(() => {
    void (async () => {
      valueSetter(await asyncValue());
    })();
  }, []);
  // update remote value on change
  useEffect(() => {
    void cachedSetter(value);
  }, [value, cachedSetter]);

  return [value, valueSetter];
}
