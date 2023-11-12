import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { Network as NofloNetwork } from 'noflo/lib/Network';
import type { BehaviorSubject } from 'rxjs';

import { WorkflowChannel } from '@/constants/channels';
import { WorkflowRunningState } from '@services/database/entity/WorkflowNetwork';
import type { ITiddlerFields } from 'tiddlywiki';
import type { StoreApi } from 'zustand/vanilla';
import { SingleChatState, WorkflowViewModelStoreState } from './viewModelStore';

/**
 * Info enough to create a network runtime.
 */
export interface IGraphInfo {
  fbpGraphString: string;
  graphTiddlerTitle: string;
  network?: {
    id: string;
    runningState: WorkflowRunningState;
    state?: INetworkState;
  };
  workspaceID: string;
}

/**
 * Context injected to every node in the network. Including UI effects, and other context.
 */
export interface IWorkflowContext {
  /** Workflow ID / Network ID / Chat ID, the same thing. */
  id: string;
  store: StoreApi<WorkflowViewModelStoreState>;
}

export interface INetworkState {
  /**
   * Title, tags, created, modified...
   */
  meta?: ITiddlerFields;
  /**
   * State for UI, recording visible chat history.
   */
  viewModel: SingleChatState;
}

/**
 * Manage running workflows in the memory, and serialize/deserialize them to/from the database
 */
export interface IWorkflowService {
  /**
   * Add a network to the memory, and add to the database
   * @param workspaceID workspaceID containing the tiddler.
   * @param graphTiddlerTitle Tiddler's title which includes the FBP graph JSON stringified string
   * @returns new network id (chat id), and latest network state
   */
  addNetworkFromGraphTiddlerTitle(workspaceID: string, graphTiddlerTitle: string): Promise<{ id: string; state: INetworkState }>;
  /**
   * Get NoFlo Network (runtime instance) from fbp Graph (static graph description) that deserialize from a tiddler's text.
   * Add to the memory, and add to the database. Ready to execute, or start immediately.
   *
   * @param graphInfo Please provide `networkID` if this network is already in the database, so we can resume its state.
   */
  deserializeNetworkAndAdd(
    graphInfo: IGraphInfo,
    options?: { start?: boolean },
  ): Promise<{ id: string; network: NofloNetwork; state: INetworkState }>;
  getFbpGraphStringFromURI(graphURI: string): Promise<{ fbpGraphString: string; graphTiddlerTitle: string; workspaceID: string }>;
  /**
   * Get current state of a network, including viewModel and chat history, etc.
   * @param networkID The chat ID
   * @param providedState Normally we get state from stores, you can provide it here, so we can skip getting it from the store.
   */
  getNetworkState(networkID: string, providedState?: Partial<INetworkState>): INetworkState;
  listNetworks(): Array<[string, NofloNetwork]>;
  /**
   * Get graph's definition, not including the state
   */
  serializeNetwork(networkID: string): string;
  /**
   * Get graph's runtime state, including viewModel and chat history, etc.
   */
  serializeNetworkState(networkID: string): string;
  /**
   * Start running a network by its id. Resume its state based on serializedState on database.
   *
   * The network must be added to the memory and database (by `deserializeNetworkAndAdd`) before calling this method.
   * You can pass `start: true` to `deserializeNetworkAndAdd` to start the network immediately by automatically calling this method.
   */
  startNetwork(networkID: string): Promise<void>;
  /**
   * Start all workflows that are marked as running in the database. Resume their state based on serializedState on database.
   */
  startWorkflows(): Promise<void>;
  /**
   * Stop a network by its id. Save its state to database.
   */
  stopNetwork(networkID: string): Promise<void>;
  /**
   * subscribe to the network outcome, to see if we need to update the UI elements
   * @param networkID The chat ID
   */
  subscribeNetworkState$(networkID: string): BehaviorSubject<INetworkState>;
  updateNetworkState(networkID: string, nextState: INetworkState): Promise<void>;
}
export const WorkflowServiceIPCDescriptor = {
  channel: WorkflowChannel.name,
  properties: {
    addNetworkFromGraphTiddlerTitle: ProxyPropertyType.Function,
    deserializeNetworkAndAdd: ProxyPropertyType.Function,
    getFbpGraphStringFromURI: ProxyPropertyType.Function,
    listNetworks: ProxyPropertyType.Function,
    serializeNetwork: ProxyPropertyType.Function,
    startNetwork: ProxyPropertyType.Function,
    startWorkflows: ProxyPropertyType.Function,
    stopNetwork: ProxyPropertyType.Function,
    subscribeNetworkState$: ProxyPropertyType.Function$,
    updateNetworkState: ProxyPropertyType.Function,
  },
};
