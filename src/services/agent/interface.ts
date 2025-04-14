import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { BehaviorSubject } from 'rxjs';

import { AgentChannel } from '@/constants/channels';
import { AgentDefinition, AgentState } from '@services/externalAPI/interface';

/**
 * Agent service to manage chat agents and service agents
 */
export interface IAgentService {
}

export const AgentServiceIPCDescriptor = {
  channel: AgentChannel.name,
  properties: {
  },
};
