import { Asyncify, ConditionalKeys } from 'type-fest';
import { Observable } from 'rxjs';

export type ProxyAsyncProperties<OriginalProxy> = ConditionalKeys<OriginalProxy, Function>;
export type ProxyObservableProperties<OriginalProxy> =
  | ConditionalKeys<OriginalProxy, Observable<unknown>>
  | ConditionalKeys<OriginalProxy, (id: string) => Observable<unknown>>;
export type ProxyWithOnlyObservable<OriginalProxy> = Pick<OriginalProxy, ProxyObservableProperties<OriginalProxy>>;
export type ProxyWithOutObservable<OriginalProxy> = Omit<OriginalProxy, ProxyObservableProperties<OriginalProxy>>;

/**
 * To call services that is located in main process, from the renderer process, we use IPC.invoke, so all method should now promisify
 * Note this type only promisify methods that return things, not methods that returns observable.
 */
 export type AsyncifyProxy<
  OriginalProxy,
  ObservableKey extends ProxyObservableProperties<OriginalProxy> = ProxyObservableProperties<OriginalProxy>,
  AsyncKey extends Exclude<ProxyAsyncProperties<OriginalProxy>, ObservableKey> = Exclude<ProxyAsyncProperties<OriginalProxy>, ObservableKey>
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
  Value = 'value',
  Value$ = 'value$',
  Function = 'function',
  Function$ = 'function$',
}

export interface ProxyDescriptor {
  channel: string;
  properties: { [propKey: string]: ProxyPropertyType };
}

/* Request Types */
export enum RequestType {
  Get = 'get',
  Apply = 'apply',
  Subscribe = 'subscribe',
  ApplySubscribe = 'applySubscribe',
  Unsubscribe = 'unsubscribe',
}

export interface UnknownRequest {
  type: 'unknown';
}

export interface GetRequest {
  type: RequestType.Get;
  propKey: PropertyKey;
}

export interface ApplyRequest {
  type: RequestType.Apply;
  propKey: string;
  args: any[];
}

export interface SubscribeRequest {
  type: RequestType.Subscribe;
  propKey: string;
  subscriptionId?: string;
}

export interface ApplySubscribeRequest {
  type: RequestType.ApplySubscribe;
  propKey: string;
  args: any[];
  subscriptionId?: string;
}

export interface UnsubscribeRequest {
  type: RequestType.Unsubscribe;
  subscriptionId: string;
}

export type Request = UnknownRequest | GetRequest | ApplyRequest | SubscribeRequest | ApplySubscribeRequest | UnsubscribeRequest;

/* Response Types */
export enum ResponseType {
  Result = 'result',
  Error = 'error',
  Next = 'next',
  Complete = 'complete',
}

export interface ResultResponse {
  type: ResponseType.Result;
  result: any;
}

export interface ErrorResponse {
  type: ResponseType.Error;
  error: any;
}

export interface NextResponse {
  type: ResponseType.Next;
  value: any;
}

export interface CompleteResponse {
  type: ResponseType.Complete;
}

export type Response = ResultResponse | ErrorResponse | NextResponse | CompleteResponse;
