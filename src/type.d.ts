/* eslint-disable @typescript-eslint/naming-convention */
declare module 'errio' {
  export function parse(error: Error): Error;
  export function stringify(error: Error): string;
  export function register(error: ErrorConstructor): void;
}

declare module '@tiddlygit/tiddlywiki' {
  export * from 'tiddlywiki';
}

declare module 'the-graph' {
  import { Graph } from 'fbp-graph';

  export interface ITheGraphProps {
    getMenuDef?: (options: {
      graph: any;
      item: any;
      itemKey: any;
      type: string;
    }) => any;
    graph: Graph;
    height: number | string;
    library?: IFBPLibrary;
    offsetX?: number;
    onEdgeSelection: (edgeID: string, edge: any, toggle: boolean) => void;
    onNodeSelection: (nodeID: string, node: any, toggle: boolean) => void;
    onPanScale: (x: number, y: number, scale: number) => void;
    readonly: boolean;
    ref?: RefObject<HTMLDivElement>;
    width: number | string;
  }
  export function App(props: ITheGraphProps): JSX.Element;

  export interface INoFloProtocolComponentPort {
    addressable?: boolean;
    /**
     * @example default: 'default-value',
     */
    default: unknown;
    description: string;
    id: string;
    required?: boolean;
    schema?: string;
    type: string;
    /**
     * @example values: 'noflo is awesome'.split(' ')
     */
    values: unknown[];
  }
  /**
   * ```json
   * {
        "name": "adapters/ObjectToString",
        "icon": "font",
        "description": "stringifies a simple object with configurable associator and delimiter",
        "subgraph": false,
        "inports": [
            {
                "id": "in",
                "type": "object",
                "schema": null,
                "required": false,
                "description": "Object to convert",
                "name": "in"
            },
            {
                "id": "assoc",
                "type": "string",
                "schema": null,
                "required": false,
                "default": ":",
                "description": "Associating string for key/value pairs",
                "name": "assoc"
            },
            {
                "id": "delim",
                "type": "string",
                "schema": null,
                "required": false,
                "default": ",",
                "description": "Delimiter string between object properties",
                "name": "delim"
            }
        ],
        "outports": [
            {
                "id": "out",
                "type": "string",
                "schema": null,
                "required": false,
                "description": "string",
                "name": "out"
            }
        ]
    }
    ```
   */
  export interface INoFloUIComponentPort extends Omit<INoFloProtocolComponentPort, 'id'> {
    name: string;
  }
  function componentsFromGraph(graph: Graph): INoFloUIComponent[];
  export interface INoFloUIComponent {
    description: string;
    icon: string;
    inports?: INoFloUIComponentPort[];
    name: string;
    outports?: INoFloUIComponentPort[];
    /**
     * True means this is not a Elementary component
     */
    subgraph?: boolean;
    unnamespaced?: boolean;
  }
  export interface INoFloProtocolComponent extends Omit<INoFloUIComponent, 'inports' | 'outports'> {
    inPorts?: INoFloProtocolComponentPort[];
    outPorts?: INoFloProtocolComponentPort[];
  }
  export type IFBPLibrary = Record<string, INoFloUIComponent>;
  function libraryFromGraph(graph: Graph): IFBPLibrary;

  export const library = {
    componentsFromGraph,
    libraryFromGraph,
  };

  function styleFromTheme(theme: 'dark' | 'light'): {
    height: number;
    lineWidth: number;
    nodeSize: number;
    width: number;
  };
  function renderThumbnail(contextcontext: CanvasRenderingContext2D | null, graph: Graph, properties: ReturnType<typeof styleFromTheme>): {
    rectangle: number[];
    scale: number;
  };
  export const thumb = {
    styleFromTheme,
    render: renderThumbnail,
  };

  export interface ITheGraphNavProps {
    graph: Graph;
    height: number;
    onPanTo: () => void;
    onTap: () => void;
    viewrectangle: number[];
    viewscale: number;
    width: number;
  }
  function NavComponent(props: ITheGraphNavProps): JSX.Element;
  export const nav = {
    Component: NavComponent,
  };

  /**
   * @url https://github.com/flowhub/the-graph/blob/7e9457ece2923dd86b1078019d50fc18e7052770/the-graph/font-awesome-unicode-map.js
   * ```js
   * // This file is generated via `npm run fontawesome`
      module.exports = {
        '500px': '',
        'address-book': '',
        'address-book-o': '',
    ```
   */
  export const FONT_AWESOME: Record<string, string>;
}

declare module 'espree' {
  // https://github.com/eslint/espree#options
  export interface Options {
    comment?: boolean;
    ecmaFeatures?: {
      globalReturn?: boolean;
      impliedStrict?: boolean;
      jsx?: boolean;
    };
    ecmaVersion?:
      | 3
      | 5
      | 6
      | 7
      | 8
      | 9
      | 10
      | 11
      | 12
      | 2015
      | 2016
      | 2017
      | 2018
      | 2019
      | 2020
      | 2021
      | 2022
      | 'latest';
    loc?: boolean;
    range?: boolean;
    sourceType?: 'script' | 'module';
    tokens?: boolean;
  }
  // https://github.com/eslint/espree#options
  export function parse(code: string, options?: Options): any;
  // https://github.com/eslint/espree#tokenize
  export function tokenize(code: string, options?: Options): any;
}

declare module 'threads-plugin' {
  const value: any;
  export default value;
}
declare module 'v8-compile-cache-lib' {
  export namespace __TEST__ {
    export function getMainName(): string;
    export function getCacheDir(): string;
    export function supportsCachedData(): boolean;
  }
  export function install(options?: {
    cacheDir?: string;
    prefix?: string;
  }): {
    uninstall(): void;
  } | undefined;
}
declare module 'webpack2-externals-plugin' {
  const value: any;
  export default value;
}
declare module '*.png' {
  const value: string;
  export default value;
}
declare module '*.svg' {
  const value: string;
  export default value;
}
declare module '@authing/sso' {
  export interface ILoginInfo {
    urlParams: UrlParameters;
    userInfo: UserInfo;
  }
  export interface ITrackSessionResultSuccess extends ILoginInfo {
    session: Session;
  }
  export interface ITrackSessionResultFailed {
    session: null;
  }
  export type ITrackSessionResult = ITrackSessionResultSuccess | ITrackSessionResultFailed;

  export interface Session {
    appId: string;
    type: string;
    userId: string;
  }

  export interface UserInfo {
    _id: string;
    company: string;
    email: string;
    nickname: string;
    oauth?: string;
    photo: string;
    registerInClient: string;
    thirdPartyIdentity?: {
      accessToken?: string;
      provider?: string;
    };
    token: string;
    tokenExpiredAt: string;
    username: string;
  }

  export interface UrlParameters {
    access_token: string;
    code: string;
    id_token: string;
  }

  export default class AuthingSSO {
    constructor(options: { appDomain: string; appId: string; redirectUrl: string });
    trackSession(): Promise<ITrackSessionResult>;
    logout(): Promise<{ code: number; message?: string }>;
    login(): Promise<void>;
  }
}

interface IDefaultGatewayInfo {
  gateway: string;
  interface: 'WLAN';
}
declare module 'default-gateway/ibmi' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
declare module 'default-gateway/android' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
declare module 'default-gateway/darwin' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
declare module 'default-gateway/freebsd' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
declare module 'default-gateway/linux' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
declare module 'default-gateway/openbsd' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
declare module 'default-gateway/sunos' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
declare module 'default-gateway/win32' {
  export function v4(): Promise<IDefaultGatewayInfo>;
}
