import { useEffect, useState } from 'react';
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
  useEffect(() => {
    void (async () => {
      valueSetter(await asyncValue());
    });
  }, []);

  return value;
}
