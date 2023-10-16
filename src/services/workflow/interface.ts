import { Network as NofloNetwork } from 'noflo/lib/Network';

import { ProxyPropertyType } from 'electron-ipc-cat/common';

import { WorkflowChannel } from '@/constants/channels';
import { WorkflowRunningState } from '@services/database/entity/WorkflowNetwork';

export interface IGraphInfo {
  fbpGraphString: string;
  graphTiddlerTitle: string;
  network?: {
    id: string;
    runningState: WorkflowRunningState;
    serializedState: string;
  };
  workspaceID: string;
}

/**
 * Manage running workflows in the memory, and serialize/deserialize them to/from the database
 */
export interface IWorkflowService {
  /**
   * Add a network to the memory, and add to the database
   * @param workspaceID workspaceID containing the tiddler.
   * @param graphTiddlerTitle Tiddler's title which includes the FBP graph JSON stringified string
   */
  addNetworkFromGraphTiddlerTitle(workspaceID: string, graphTiddlerTitle: string): Promise<void>;
  /**
   * Get NoFlo Network (runtime instance) from fbp Graph (static graph description) that deserialize from a tiddler's text.
   * Add to the memory, and add to the database. Ready to execute, or start immediately.
   *
   * @param graphInfo Please provide `networkID` if this network is already in the database, so we can resume its state.
   */
  deserializeNetworkAndAdd(
    graphInfo: IGraphInfo,
    options?: { start?: boolean },
  ): Promise<{ id: string; network: NofloNetwork }>;
  getFbpGraphStringFromURI(graphURI: string): Promise<{ fbpGraphString: string; graphTiddlerTitle: string; workspaceID: string }>;
  listNetworks(): Array<[string, NofloNetwork]>;
  serializeNetwork(networkID: string): string;
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
  },
};
