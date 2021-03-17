/**
 * fix https://github.com/electron/electron/issues/28176
 * We cannot pass Observable across contextBridge, so we have to add a hidden patch to the object on preload script, and use that patch to regenerate Observable on renderer side
 * This file is "unsafe" and will full of type warnings, which is necessary
 */
import { Observable } from 'rxjs';
import { ProxyDescriptor, ProxyPropertyType } from './common';
import { getSubscriptionKey } from './utils';

/**
 * Create `window.observables.xxx` from `window.service.xxx`
 * @param name service name
 * @param service service client proxy created in preload script
 * @param descriptor electron ipc proxy descriptor
 */
export function ipcProxyFixContextIsolation<T extends Record<string, any>>(name: keyof typeof window.service, service: T, descriptor: ProxyDescriptor): void {
  for (const key in descriptor.properties) {
    // Process all Observables, we pass a `.next` function from preload script, that we can used to reconstruct Observable
    if (ProxyPropertyType.Value$ === descriptor.properties[key] && !(key in service) && getSubscriptionKey(key) in service) {
      const subscribedObservable = new Observable((observer) => {
        service[getSubscriptionKey(key)]((value: any) => observer.next(value));
      }) as T[keyof T];
      // store newly created Observable to `window.observables.xxx.yyy`
      if (window.observables === undefined) {
        window.observables = {} as typeof window.observables;
      }
      if (window.observables[name] === undefined) {
        (window.observables as any)[name] = {
          [key]: subscribedObservable,
        };
      } else {
        (window.observables as any)[name][key] = subscribedObservable;
      }
    }
  }
}

/**
 * Process `window.service`, reconstruct Observables into `window.observables`
 */
export function fixContextIsolation(): void {
  const { descriptors, ...services } = window.service;

  for (const key in services) {
    const serviceName = key as Exclude<keyof typeof window.service, 'descriptors'>;
    ipcProxyFixContextIsolation(serviceName, services[serviceName], descriptors[serviceName]);
  }
}
