import { Graph as FbpGraph } from 'fbp-graph';
import { loadJSON } from 'fbp-graph/lib/Graph';
import { ComponentLoader, createNetwork } from 'noflo';
import { Network } from 'noflo/lib/Network';
import { IFBPLibrary } from 'the-graph';
import { createStore, StoreApi } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { getBrowserComponentLibrary } from '../GraphEditor/utils/library';

/**
 * Metadata that will need to represent in react UI
 */
interface INetworkMetadata {
  running: boolean;
}
interface NetworkStoreState {
  networks: Record<string, INetworkMetadata | undefined>;
}
interface NetworkStoreActions {
  addNetwork(id: string, item: INetworkMetadata): void;
  removeNetwork(id: string): void;
  updateNetwork(id: string, item: Partial<INetworkMetadata>): void;
}

const defaultNetworkMetadata: INetworkMetadata = { running: false };
export const networkStore = createStore(
  immer<NetworkStoreState & NetworkStoreActions>((set) => ({
    networks: {},

    addNetwork: (id, item) => {
      set((state) => {
        state.networks[id] = item;
      });
    },

    removeNetwork: (id) => {
      set((state) => {
        state.networks[id] = undefined;
      });
    },

    updateNetwork: (id, item) => {
      set((state) => {
        const oldItem = state.networks[id];
        if (oldItem !== undefined) {
          for (const key in item) {
            const value = item[key as keyof INetworkMetadata];
            if (key in oldItem && value !== undefined) {
              oldItem[key as keyof INetworkMetadata] = value;
            }
          }
        }
      });
    },
  })),
);

class NetworkManager {
  private static instance: NetworkManager | undefined;
  public networks: Record<string, Network | undefined>;
  public networkStore: StoreApi<NetworkStoreState & NetworkStoreActions>;

  private constructor() {
    this.networks = {};
    this.networkStore = networkStore;
  }

  public static getInstance(): NetworkManager {
    if (NetworkManager.instance === undefined) {
      NetworkManager.instance = new NetworkManager();
    }
    return NetworkManager.instance;
  }

  private _libraryToLoad?: IFBPLibrary;
  private _componentLoader?: ComponentLoader;

  private async initLibrary() {
    const [libraryToLoad, componentLoader] = await getBrowserComponentLibrary();
    this._libraryToLoad = libraryToLoad;
    this._componentLoader = componentLoader;
    return [libraryToLoad, componentLoader] as const;
  }

  private get componentLoader(): Promise<ComponentLoader> {
    if (this._componentLoader !== undefined) {
      return Promise.resolve(this._componentLoader);
    }
    return this.initLibrary().then(([, componentLoader]) => componentLoader);
  }

  public async addNetworkFromGraph(networkID: string, fbpGraph: FbpGraph): Promise<Network> {
    /**
     * Similar to noflo-runtime-base's `src/protocol/Network.js`, transform FbpGraph to ~~NofloGraph~~ Network
     */
    const newNofloNetwork: Network = await createNetwork(fbpGraph, {
      subscribeGraph: false,
      delay: true,
      componentLoader: await this.componentLoader,
    });
    this.networks[networkID] = newNofloNetwork;
    this.networkStore.getState().addNetwork(networkID, defaultNetworkMetadata);
    return newNofloNetwork;
  }

  public async startNetwork(networkID: string): Promise<void> {
    const network = this.networks[networkID];
    if (network === undefined) throw new Error('Network not found');
    await network.start();
    network.once('end', () => {
      this.networkStore.getState().updateNetwork(networkID, { running: false });
    });
    this.networkStore.getState().updateNetwork(networkID, { running: true });
  }

  public async stopNetwork(networkID: string): Promise<void> {
    const network = this.networks[networkID];
    if (network === undefined) throw new Error('Network not found');
    await network.stop();
    this.networkStore.getState().updateNetwork(networkID, { running: false });
  }

  public serializeNetwork(networkID: string): string {
    const network = this.networks[networkID];
    if (network === undefined) throw new Error('Network not found');
    return JSON.stringify(network.graph.toJSON());
  }

  public async deserializeNetwork(networkID: string, jsonString: string): Promise<void> {
    const graph: FbpGraph = await loadJSON(jsonString);
    await this.addNetworkFromGraph(networkID, graph);
  }

  public listNetworks(): string[] {
    return Object.keys(this.networks);
  }
}

export const networkManager = NetworkManager.getInstance();
