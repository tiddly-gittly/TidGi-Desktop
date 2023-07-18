/* eslint-disable @typescript-eslint/naming-convention */
declare module 'errio' {
  export function parse(error: Error): Error;
  export function stringify(error: Error): string;
  export function register(error: ErrorConstructor): void;
}

declare module '@tiddlygit/tiddlywiki' {
  export * from 'tiddlywiki';
}

declare module 'llama-node/dist/llm/llama-cpp.cjs' {
  export { LLamaCpp } from 'llama-node/dist/llm/llama-cpp';
}
declare module 'llama-node/dist/llm/rwkv-cpp.cjs' {
  export { RwkvCpp } from 'llama-node/dist/llm/rwkv-cpp';
}

declare module 'the-graph' {
  import { Graph, GraphEdge, GraphNode } from 'fbp-graph';
  import { MutableRefObject } from 'react';
  import { Component as NoFloComponent } from 'noflo';

  export interface ITheGraphEditorContextMenuOptions {
    element: ITheGraphEditor;
    graph: Graph;
    item: Graph | GraphNode | GraphEdge;
    itemKey: 'graph' | 'node' | 'edge';
    /**
     * Keyof this.props.menus
     * For example, `'main'`
     */
    type: string;
    x?: number;
    y?: number;
  }
  export interface ITheGraphProps {
    contextMenu?: contextMenu;
    getEditorRef?: MutableRefObject<ITheGraphEditor | undefined>;
    getMenuDef?: (options: ITheGraphEditorContextMenuOptions) => any;
    graph: Graph;
    height: number | string;
    library?: IFBPLibrary;
    offsetX?: number;
    onEdgeSelection: (edgeID: string, edge: any, toggle: boolean) => void;
    onNodeSelection: (nodeID: string, node: any, toggle: boolean) => void;
    onPanScale: (x: number, y: number, scale: number) => void;
    readonly: boolean;
    width: number | string;
  }
  export interface ITheGraphEditorState {
    height: number;
    maxZoom: number;
    minZoom: number;
    scale: number;
    tooltip: string;
    tooltipVisible: boolean;
    tooltipX: number;
    tooltipY: number;
    trackStartX: number | null;
    trackStartY: number | null;
    width: number;
    x: number;
    y: number;
  }
  /**
   * Things accessible in the-graph/the-graph-app.js
   */
  export interface ITheGraphEditor {
    debounceLibraryRefesh: () => void;
    dirty: boolean;
    focusNode: (node: GraphNode) => void;
    getComponent: (name: string) => void;
    hideContext: () => void;
    lastScale: number;
    lastX: number;
    lastY: number;
    library: IFBPLibrary;
    libraryDirty: boolean;
    pinching: boolean;
    refs: {
      graph?: ITheGraphEditorGraph;
    };
    registerComponent: (definition: NoFloComponent, generated: boolean) => void;
    /**
     * This is undefined, because it is in the-graph/the-graph-graph.js
     * Set the preview bounding rect by drag event
     * In the-graph/the-graph-graph.js
     * ```js
     * appDomNode.addEventListener('mousemove', this.renderPreviewEdge);
     * appDomNode.addEventListener('panmove', this.renderPreviewEdge);
     * appDomNode.addEventListener('tap', this.cancelPreviewEdge);
      ```
     */
    renderPreviewEdge?: (event: MouseEvent | TouchEvent) => void;
    rerender: () => void;
    setState: (state: Partial<ITheGraphEditorState>) => void;
    showContext: (options: ITheGraphEditorContextMenuOptions) => void;
    state: ITheGraphEditorState;
    theme: 'dark' | 'light';
    triggerAutolayout: () => void;
    triggerFit: () => void;
    unselectAll: () => void;
    zoomFactor: number;
    zoomX: number;
    zoomY: number;
  }
  export interface ITheGraphEditorGraphState {
    animatedEdges: GraphEdge[];
    displaySelectionGroup: boolean;
    edgePreview: GraphEdge | null;
    edgePreviewX: number;
    edgePreviewY: number;
    errorNodes: GraphNode[];
    forceSelection: boolean;
    offsetX: number;
    offsetY: number;
    selectedEdges: GraphEdge[];
    selectedNodes: GraphNode[];
  }
  export interface ITheGraphEditorGraphProps {
    app: ITheGraphEditor | null;
    graph: Graph;
    library: IFBPLibrary;
    // allows overriding icon of a node
    nodeIcons: Record<string, string>;
    offsetX: number;
    offsetY: number;
  }
  export interface ITheGraphEditorGraph {
    addEdge: Function;
    cancelPreviewEdge: Function;
    context: {};
    dirty: false;
    edgeStart: Function;
    getComponentInfo: Function;
    getGraphInport: Function;
    getGraphOutport: Function;
    getNodeInport: Function;
    getNodeOutport: Function;
    getPorts: Function;
    markDirty: Function;
    mounted: true;
    moveGroup: Function;
    /**
     * ```json
     * {"adapters/ObjectToString_emfdv":{"inports":{"in":{"label":"in","type":"object","x":0,"y":18},"assoc":{"label":"assoc","type":"string","x":0,"y":36,"route":0},"delim":{"label":"delim","type":"string","x":0,"y":54,"route":0}},"outports":{"out":{"label":"out","type":"string","x":72,"y":36,"route":0}}},"adapters/PacketsToObject_llf0k":{"inports":{"in":{"label":"in","type":"all","x":0,"y":36,"route":0}},"outports":{"out":{"label":"out","type":"object","x":72,"y":36}}}}
     * ```
     */
    portInfo?: Record<string, { inports: INoFloProtocolComponentPort[]; outports: INoFloProtocolComponentPort[] }>;
    props: ITheGraphEditorGraphProps;
    refs: {};
    renderPreviewEdge: Function;
    resetPortRoute: Function;
    setAnimatedEdges: Function;
    setErrorNodes: Function;
    setSelectedEdges: Function;
    setSelectedNodes: Function;
    state: ITheGraphEditorGraphState;
    subscribeGraph: Function;
    triggerRender: Function;
    updateIcon: Function;
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
    onPanTo?: (panTo: {
      x: number;
      y: number;
    }, event: MouseEvent) => void;
    onTap?: () => void;
    viewrectangle?: number[];
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

  /**
   *
   * @param keilerGraph assign by
   * ```js
   * autolayouter = klayNoflo.init({
      onSuccess: this.applyAutolayout.bind(this),
      workerScript: 'vendor/klayjs/klay.js',
    })
    ```
   * @param props `{ snap: 36 }` in noflo-ui example.
   */
  function applyAutolayout(graph: Graph, keilerGraph, props: { snap: number }): void;
  export const autolayout = {
    applyToGraph: applyAutolayout,
  };
}
declare module 'the-graph/the-graph-nav/the-graph-nav' {
  import { nav } from 'the-graph';
  export const Component = nav.Component;
}

declare module 'the-graph/the-graph/the-graph-autolayout' {
  import { autolayout } from 'the-graph';
  // eslint-disable-next-line unicorn/prefer-export-from
  export default autolayout;
}

declare module 'klayjs-noflo/klay-noflo' {
  import { Graph } from 'fbp-graph';
  export interface IKlayLayoutOptions {
    direction: string;
    graph: Graph;
    options: {
      algorithm: string;
      borderSpacing: number;
      crossMin: string;
      direction: string;
      edgeRouting: string;
      edgeSpacingFactor: number;
      inLayerSpacingFactor: number;
      intCoordinates: boolean;
      layoutHierarchy: boolean;
      nodeLayering: string;
      nodePlace: string;
      spacing: number;
    };
    portInfo:
      | Record<string, {
        inports: INoFloProtocolComponentPort[];
        outports: INoFloProtocolComponentPort[];
      }>
      | undefined;
  }
  export const klayNoflo: {
    init(options: { onSuccess: (keilerGraph: unknown) => void; workerScript: string }): typeof klayNoflo;
    layout(options: IKlayLayoutOptions): void;
  };
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
