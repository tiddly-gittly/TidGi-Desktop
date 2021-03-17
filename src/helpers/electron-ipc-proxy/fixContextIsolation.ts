/**
 * fix https://github.com/electron/electron/issues/28176
 * We cannot pass Observable across contextBridge, so we have to add a hidden patch to the object on preload script, and use that patch to regenerate Observable on renderer side
 * This file is "unsafe" and will full of type warnings, which is necessary
 */
import { Observable } from 'rxjs';
import { ProxyDescriptor, ProxyPropertyType } from './common';
import { getSubscriptionKey } from './utils';

export function ipcProxyFixContextIsolation<T extends Record<string, any>>(name: keyof typeof window.service, service: T, descriptor: ProxyDescriptor): void {
  for (const key in descriptor.properties) {
    if (descriptor.properties[key] === ProxyPropertyType.Value$ && !(key in service) && getSubscriptionKey(key) in service) {
      const subscribedObservable = new Observable((observer) => {
        service[getSubscriptionKey(key)]((value: any) => observer.next(value));
      }) as T[keyof T];
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

export function fixContextIsolation(): void {
  const { descriptors, ...services } = window.service;

  for (const key in services) {
    const serviceName = key as Exclude<keyof typeof window.service, 'descriptors'>;
    ipcProxyFixContextIsolation(serviceName, services[serviceName], descriptors[serviceName]);
  }
}
