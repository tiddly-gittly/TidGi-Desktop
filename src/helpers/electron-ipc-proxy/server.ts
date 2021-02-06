/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { Observable, Subscription } from 'rxjs';
import { ipcMain, IpcMain, WebContents, IpcMainEvent } from 'electron';
import Errio from 'errio';
import { IpcProxyError, isFunction, isObservable } from './utils';
import {
  Request,
  RequestType,
  ResponseType,
  GetRequest,
  ApplyRequest,
  SubscribeRequest,
  UnsubscribeRequest,
  ProxyDescriptor,
  ProxyPropertyType,
  ApplySubscribeRequest,
} from './common';

// TODO: make it to be able to use @decorator, instead of write a description json. We can defer the setup of ipc handler to make this possible.
const registrations: { [channel: string]: ProxyServerHandler | null } = {};

export function registerProxy<T>(target: T, descriptor: ProxyDescriptor, transport: IpcMain = ipcMain): VoidFunction {
  const { channel } = descriptor;

  if (registrations[channel]) {
    throw new IpcProxyError(`Proxy object has already been registered on channel ${channel}`);
  }

  const server = new ProxyServerHandler(target);
  registrations[channel] = server;

  transport.on(channel, (event: IpcMainEvent, request: Request, correlationId: string) => {
    let sender: WebContents | undefined = event.sender;
    const nullify = (): void => {
      sender = undefined;
    };
    sender.once('destroyed', nullify);

    server
      .handleRequest(request, sender)
      .then((result) => {
        if (sender) {
          sender.send(correlationId, { type: ResponseType.Result, result });
          sender.removeListener('destroyed', nullify);
        }
      })
      .catch((error) => {
        if (sender) {
          sender.send(correlationId, { type: ResponseType.Error, error: Errio.stringify(error) });
          sender.removeListener('destroyed', nullify);
        }
      });
  });

  return () => unregisterProxy(channel, transport);
}

function unregisterProxy(channel: string, transport: IpcMain) {
  transport.removeAllListeners(channel);
  const server = registrations[channel];

  if (!server) {
    throw new IpcProxyError(`No proxy is registered on channel ${channel}`);
  }

  server.unsubscribeAll();
  delete registrations[channel];
}

class ProxyServerHandler {
  constructor(private readonly target: any) {}

  private subscriptions: { [subscriptionId: string]: Subscription } = {};

  public async handleRequest(request: Request, sender: WebContents): Promise<any> {
    switch (request.type) {
      case RequestType.Get:
        return await this.handleGet(request);
      case RequestType.Apply:
        return this.handleApply(request);
      case RequestType.Subscribe:
        return this.handleSubscribe(request, sender);
      case RequestType.ApplySubscribe:
        return this.handleApplySubscribe(request, sender);
      case RequestType.Unsubscribe:
        return this.handleUnsubscribe(request);
      default:
        throw new IpcProxyError(`Unhandled RequestType [${request.type}]`);
    }
  }

  public unsubscribeAll(): void {
    Object.values(this.subscriptions).forEach((subscription) => subscription.unsubscribe());
    this.subscriptions = {};
  }

  private async handleGet(request: GetRequest): Promise<any> {
    return this.target[request.propKey];
  }

  private handleApply(request: ApplyRequest): any {
    const { propKey, args } = request;
    const function_ = this.target[propKey];

    if (!isFunction(function_)) {
      throw new IpcProxyError(`Remote property [${propKey}] is not a function`);
    }

    return function_.apply(this.target, args);
  }

  private handleSubscribe(request: SubscribeRequest, sender: WebContents): void {
    const { propKey, subscriptionId } = request;
    const obs = this.target[propKey];

    if (!isObservable(obs)) {
      throw new IpcProxyError(`Remote property [${propKey}] is not an observable`);
    }

    this.doSubscribe(obs, subscriptionId, sender);
  }

  private handleApplySubscribe(request: ApplySubscribeRequest, sender: WebContents): void {
    const { propKey, subscriptionId, args } = request;
    const function_ = this.target[propKey];

    if (!isFunction(function_)) {
      throw new IpcProxyError(`Remote property [${propKey}] is not a function`);
    }

    const obs = function_.apply(this.target, args);

    if (!isObservable(obs)) {
      throw new IpcProxyError(`Remote function [${propKey}] did not return an observable`);
    }

    this.doSubscribe(obs, subscriptionId, sender);
  }

  private doSubscribe(obs: Observable<any>, subscriptionId: string, sender: WebContents): void {
    if (this.subscriptions[subscriptionId]) {
      throw new IpcProxyError(`A subscription with Id [${subscriptionId}] already exists`);
    }

    this.subscriptions[subscriptionId] = obs.subscribe(
      (value) => sender.send(subscriptionId, { type: ResponseType.Next, value }),
      (error: Error) => sender.send(subscriptionId, { type: ResponseType.Error, error: Errio.stringify(error) }),
      () => sender.send(subscriptionId, { type: ResponseType.Complete }),
    );

    /* If the sender does not clean up after itself then we need to do it */
    sender.once('destroyed', () => this.doUnsubscribe(subscriptionId));
  }

  private handleUnsubscribe(request: UnsubscribeRequest): void {
    const { subscriptionId } = request;

    if (!this.subscriptions[subscriptionId]) {
      throw new IpcProxyError(`Subscription with Id [${subscriptionId}] does not exist`);
    }

    this.doUnsubscribe(subscriptionId);
  }

  private doUnsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions[subscriptionId];

    if (subscription) {
      subscription.unsubscribe();
      delete this.subscriptions[subscriptionId];
    }
  }
}

export { ProxyDescriptor, ProxyPropertyType };
