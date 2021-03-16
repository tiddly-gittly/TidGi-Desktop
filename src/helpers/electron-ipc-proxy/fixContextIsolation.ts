/**
 * fix https://github.com/electron/electron/issues/28176
 * We cannot pass Observable across contextBridge, so we have to add a hidden patch to the object on preload script, and use that patch to regenerate Observable on renderer side
 */
import { Observable } from 'rxjs';
import { ProxyDescriptor, ProxyPropertyType } from './common';
import { getSubscriptionKey } from './utils';

export function ipcProxyFixContextIsolation<T extends Record<string, any>>(service: T, descriptor: ProxyDescriptor): void {
  for (const key in descriptor.properties) {
    if (descriptor.properties[key] === ProxyPropertyType.Value$ && !(key in service) && getSubscriptionKey(key) in service) {
      // object is not extensible as contextBridge uses https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/preventExtensions
      // but we can still assign property to __proto__
      service.__proto__[key as keyof T] = new Observable((observer) => {
        service[getSubscriptionKey(key)]((value: any) => observer.next(value));
      }) as T[keyof T];
    }
  }
}

export function fixContextIsolation(): void {
  const { descriptors, ...services } = window.service;
  for (const key in services) {
    const serviceName = key as Exclude<keyof typeof window.service, 'descriptors'>;
    ipcProxyFixContextIsolation(services[serviceName], descriptors[serviceName]);
  }
}
