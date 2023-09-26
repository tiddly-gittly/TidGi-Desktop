import { Graph as FbpGraph } from 'fbp-graph';
import { Network } from 'noflo/lib/Network';

import { ProxyPropertyType } from 'electron-ipc-cat/common';

import { WorkflowChannel } from '@/constants/channels';

/**
 * Manage running workflows in the memory, and serialize/deserialize them to/from the database
 */
export interface IWorkflowService {
  addNetworkFromGraphJSON(networkID: string, fbpGraphString: string): Promise<Network>;
  deserializeNetwork(networkID: string, jsonString: string): Promise<void>;
  listNetworks(): string[];
  serializeNetwork(networkID: string): string;
  startNetwork(networkID: string): Promise<void>;
  startWorkflows(): Promise<void>;
  stopNetwork(networkID: string): Promise<void>;
}
export const WorkflowServiceIPCDescriptor = {
  channel: WorkflowChannel.name,
  properties: {
    addNetworkFromGraph: ProxyPropertyType.Function,
    deserializeNetwork: ProxyPropertyType.Function,
    listNetworks: ProxyPropertyType.Function,
    serializeNetwork: ProxyPropertyType.Function,
    startNetwork: ProxyPropertyType.Function,
    startWorkflows: ProxyPropertyType.Function,
    stopNetwork: ProxyPropertyType.Function,
  },
};
