import Errio from 'errio';

/* Custom Error */
export class IpcProxyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
Errio.register(IpcProxyError);

/* Utils */
export function isFunction(value: any): value is Function {
  return value && typeof value === 'function';
}

/**
 * Fix ContextIsolation
 * @param key original key
 * @returns
 */
export function getSubscriptionKey(key: string): string {
  return `${key}Subscribe`;
}
