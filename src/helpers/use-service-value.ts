import { useEffect, useState } from 'react';

/**
 * Use value from service, especially constant value that never changes
 * This will only update once, won't listen on later update.
 * @param valuePromise A promise contain the value we want to use in React
 * @param defaultValue empty array or undefined, as initial value
 */
export function usePromiseValue<T>(valuePromise: Promise<T> | (() => Promise<T>), defaultValue?: T): T | undefined {
  const [value, valueSetter] = useState<T | undefined>(defaultValue);
  useEffect(() => {
    void (async () => {
      valueSetter(typeof valuePromise === 'function' ? await valuePromise() : await valuePromise);
    });
  }, []);

  return value;
}
