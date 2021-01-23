import { Observable } from 'rxjs';
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

export function isObservable<T>(value: any): value is Observable<T> {
  return value && typeof value.subscribe === 'function';
}
