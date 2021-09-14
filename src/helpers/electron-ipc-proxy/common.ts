import { Asyncify, ConditionalKeys } from 'type-fest';
import { Observable } from 'rxjs';

export type ProxyAsyncProperties<OriginalProxy> = ConditionalKeys<OriginalProxy, (..._arguments: never) => any>;
export type ProxyObservableProperties<OriginalProxy> =
  | ConditionalKeys<OriginalProxy, Observable<unknown>>
  | ConditionalKeys<OriginalProxy, (..._arguments: never) => Observable<unknown>>;
export type ProxyWithOnlyObservable<OriginalProxy> = Pick<OriginalProxy, ProxyObservableProperties<OriginalProxy>>;
export type ProxyWithOutObservable<OriginalProxy> = Omit<OriginalProxy, ProxyObservableProperties<OriginalProxy>>;

/**
 * To call services that is located in main process, from the renderer process, we use IPC.invoke, so all method should now promisify
 * Note this type only promisify methods that return things, not methods that returns observable.
 */
export type AsyncifyProxy<
  OriginalProxy,
  ObservableKey extends ProxyObservableProperties<OriginalProxy> = ProxyObservableProperties<OriginalProxy>,
  AsyncKey extends Exclude<ProxyAsyncProperties<OriginalProxy>, ObservableKey> = Exclude<ProxyAsyncProperties<OriginalProxy>, ObservableKey>,
> = {
  [P in AsyncKey]: Asyncify<OriginalProxy[P]>;
} &
  {
    [Q in ObservableKey]: OriginalProxy[Q];
  };

/** Extract observable keys from services */
export type IServicesWithOnlyObservables<Services extends Record<string, Record<string, any>>> = {
  [P in keyof Services]: ProxyWithOnlyObservable<Services[P]>;
};
export type IServicesWithoutObservables<Services extends Record<string, Record<string, any>>> = {
  [P in keyof Services]: ProxyWithOutObservable<Services[P]>;
};

/* Proxy Descriptor Types */
export enum ProxyPropertyType {
  Function = 'function',
  Function$ = 'function$',
  Value = 'value',
  Value$ = 'value$',
}

export interface ProxyDescriptor {
  channel: string;
  properties: { [propKey: string]: ProxyPropertyType };
}

/* Request Types */
export enum RequestType {
  Apply = 'apply',
  ApplySubscribe = 'applySubscribe',
  Get = 'get',
  Subscribe = 'subscribe',
  Unsubscribe = 'unsubscribe',
}

export interface UnknownRequest {
  type: 'unknown';
}

export interface GetRequest {
  propKey: PropertyKey;
  type: RequestType.Get;
}

export interface ApplyRequest {
  args: unknown[];
  propKey: string;
  type: RequestType.Apply;
}

export interface SubscribeRequest {
  propKey: string;
  subscriptionId?: string;
  type: RequestType.Subscribe;
}

export interface ApplySubscribeRequest {
  args: unknown[];
  propKey: string;
  subscriptionId?: string;
  type: RequestType.ApplySubscribe;
}

export interface UnsubscribeRequest {
  subscriptionId: string;
  type: RequestType.Unsubscribe;
}

export type Request = UnknownRequest | GetRequest | ApplyRequest | SubscribeRequest | ApplySubscribeRequest | UnsubscribeRequest;

/* Response Types */
export enum ResponseType {
  Complete = 'complete',
  Error = 'error',
  Next = 'next',
  Result = 'result',
}

export interface ResultResponse {
  result: unknown;
  type: ResponseType.Result;
}

export interface ErrorResponse {
  error: Error;
  type: ResponseType.Error;
}

export interface NextResponse {
  type: ResponseType.Next;
  value: unknown;
}

export interface CompleteResponse {
  type: ResponseType.Complete;
}

export type Response = ResultResponse | ErrorResponse | NextResponse | CompleteResponse;
