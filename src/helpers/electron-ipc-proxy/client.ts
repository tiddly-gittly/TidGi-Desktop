import { Subscribable, Observer, TeardownLogic, Observable, isObservable } from 'rxjs';
import { IpcRenderer, ipcRenderer, Event } from 'electron';
import { memoize } from 'lodash';
import { v4 as uuid } from 'uuid';
import Errio from 'errio';
import { getSubscriptionKey, IpcProxyError } from './utils';
import { Request, RequestType, Response, ResponseType, ProxyDescriptor, ProxyPropertyType } from './common';

export type ObservableConstructor = new (subscribe: (obs: Observer<any>) => TeardownLogic) => Subscribable<any>;

export function createProxy<T>(descriptor: ProxyDescriptor, ObservableCtor: ObservableConstructor = Observable, transport: IpcRenderer = ipcRenderer): T {
  const result = {};

  Object.keys(descriptor.properties).forEach((propertyKey) => {
    const propertyType = descriptor.properties[propertyKey];

    // Provide feedback if the Observable constructor has not been passed in
    if ((propertyType === ProxyPropertyType.Value$ || propertyType === ProxyPropertyType.Function$) && typeof ObservableCtor !== 'function') {
      throw new Error(
        'You must provide an implementation of the Observable constructor if you want to proxy Observables. Please see the docs at https://github.com/frankwallis/electron-ipc-proxy.',
      );
    }

    // fix https://github.com/electron/electron/issues/28176
    if (propertyType === ProxyPropertyType.Value$) {
      Object.defineProperty(result, getSubscriptionKey(propertyKey), {
        enumerable: true,
        get: memoize(() => (next: (value?: any) => void) => {
          const originalObservable = getProperty(propertyType, propertyKey, descriptor.channel, ObservableCtor, transport);
          if (isObservable(originalObservable)) {
            originalObservable.subscribe((value: any) => next(value));
          }
        }),
      });
    } else if (propertyType === ProxyPropertyType.Function$) {
      Object.defineProperty(result, getSubscriptionKey(propertyKey), {
        enumerable: true,
        get: memoize(() => (...arguments_: any[]) => (next: (value?: any) => void) => {
          const originalObservableFunction = getProperty(propertyType, propertyKey, descriptor.channel, ObservableCtor, transport);
          if (typeof originalObservableFunction === 'function') {
            const originalObservable = originalObservableFunction(...arguments_);
            if (isObservable(originalObservable)) {
              originalObservable.subscribe((value: any) => next(value));
            }
          }
        }),
      });
    } else {
      Object.defineProperty(result, propertyKey, {
        enumerable: true,
        get: memoize(() => getProperty(propertyType, propertyKey, descriptor.channel, ObservableCtor, transport)),
      });
    }
  });

  return result as T;
}

function getProperty(
  propertyType: ProxyPropertyType,
  propertyKey: string,
  channel: string,
  ObservableCtor: ObservableConstructor,
  transport: IpcRenderer,
): Promise<any> | Subscribable<any> | ((...arguments_: any[]) => Promise<any>) | ((...arguments_: any[]) => Subscribable<any>) {
  switch (propertyType) {
    case ProxyPropertyType.Value:
      return makeRequest({ type: RequestType.Get, propKey: propertyKey }, channel, transport);
    case ProxyPropertyType.Value$:
      return makeObservable({ type: RequestType.Subscribe, propKey: propertyKey }, channel, ObservableCtor, transport);
    case ProxyPropertyType.Function:
      return async (...arguments_: unknown[]) => await makeRequest({ type: RequestType.Apply, propKey: propertyKey, args: arguments_ }, channel, transport);
    case ProxyPropertyType.Function$:
      return (...arguments_: any[]) =>
        makeObservable({ type: RequestType.ApplySubscribe, propKey: propertyKey, args: arguments_ }, channel, ObservableCtor, transport);
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new IpcProxyError(`Unrecognised ProxyPropertyType [${propertyType}]`);
  }
}

async function makeRequest(request: Request, channel: string, transport: IpcRenderer): Promise<unknown> {
  const correlationId = uuid();
  transport.send(channel, request, correlationId);

  return await new Promise((resolve, reject) => {
    transport.once(correlationId, (event: Event, response: Response) => {
      switch (response.type) {
        case ResponseType.Result:
          return resolve(response.result);
        case ResponseType.Error:
          return reject(Errio.parse(response.error));
        default:
          return reject(new IpcProxyError(`Unhandled response type [${response.type}]`));
      }
    });
  });
}

function makeObservable(request: Request, channel: string, ObservableCtor: ObservableConstructor, transport: IpcRenderer): Subscribable<any> {
  return new ObservableCtor((observer) => {
    const subscriptionId = uuid();
    const subscriptionRequest = { ...request, subscriptionId };

    transport.on(subscriptionId, (event: Event, response: Response) => {
      switch (response.type) {
        case ResponseType.Next:
          return observer.next(response.value);
        case ResponseType.Error:
          return observer.error(Errio.parse(response.error));
        case ResponseType.Complete:
          return observer.complete();
        default:
          return observer.error(new IpcProxyError(`Unhandled response type [${response.type}]`));
      }
    });

    makeRequest(subscriptionRequest, channel, transport).catch((error: Error) => {
      console.log('Error subscribing to remote observable', error);
      observer.error(error);
    });

    return () => {
      transport.removeAllListeners(subscriptionId);
      makeRequest({ type: RequestType.Unsubscribe, subscriptionId }, channel, transport).catch((error) => {
        console.log('Error unsubscribing from remote observale', error);
        observer.error(error);
      });
    };
  });
}

export { ProxyDescriptor, ProxyPropertyType };
