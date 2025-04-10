import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { ReactElement } from 'react';
import type { BehaviorSubject } from 'rxjs';
import type { ITiddlerFields } from 'tiddlywiki';

import { AgentChannel } from '@/constants/channels';
import { IWorkspaceWithMetadata } from '@services/workspaces/interface';


/**
 * Agent service to manage chat agents and service agents
 */
export interface IAgentService {
  /**
   * Create agent from definition
   * Add to the memory, and add to the database. Ready to execute, or start immediately.
   *
   * @param agentInfo Please provide `agentID` if this agent is already in the database, so we can resume its state.
   */
  createAgentAndAdd(
    agentInfo: { definition: AgentDefinition; agentID?: string; workspaceID: string },
    options?: { start?: boolean },
  ): Promise<{ id: string; state: AgentState }>;
  getAgentDefinitionFromURI(definitionURI: string): Promise<{ definition: AgentDefinition; definitionTiddlerTitle: string; workspaceID: string }>;
  /**
   * Get current state of an agent, including viewModel and chat history, etc.
   * @param agentID The agent/chat ID
   * @param providedState Normally we get state from stores, you can provide it here, so we can skip getting it from the store.
   */
  getAgentState(agentID: string, providedState?: Partial<AgentState>): AgentState;
  listAgents(): Array<[string, AgentDefinition]>;
  /**
   * Get agent's definition
   */
  serializeAgent(agentID: string): string;
  /**
   * Get agent's runtime state, including viewModel and chat history, etc.
   * @param providedState Normally we get state from stores, you can provide it here, so we can skip getting it from the store.
   */
  serializeAgentState(agentID: string, providedState?: Partial<AgentState>): string;
  /**
   * Start running an agent by its id. Resume its state based on serializedState on database.
   *
   * The agent must be added to the memory and database (by `createAgentAndAdd`) before calling this method.
   * You can pass `start: true` to `createAgentAndAdd` to start the agent immediately by automatically calling this method.
   */
  startAgent(agentID: string): Promise<void>;
  /**
   * Start all agents that are marked as running in the database. Resume their state based on serializedState on database.
   */
  startWorkflows(): Promise<void>;
  /**
   * Stop an agent by its id. Save its state to database.
   */
  stopAgent(agentID: string): Promise<void>;
  /**
   * subscribe to the agent state, to see if we need to update the UI elements
   * @param agentID The agent/chat ID
   */
  subscribeAgentState$(agentID: string): BehaviorSubject<AgentState>;
  updateAgentState(agentID: string, nextState: AgentState): Promise<void>;
  /**
   * Send a message to a chat agent
   * @param agentID Agent ID to send message to
   * @param message User message to send
   */
  sendMessageToAgent(agentID: string, message: string): Promise<void>;
  /**
   * Trigger execution of a service agent
   * @param agentID Agent ID to execute
   * @param params Optional parameters for execution
   */
  executeServiceAgent(agentID: string, parameters?: Record<string, any>): Promise<any>;
}

export const AgentServiceIPCDescriptor = {
  channel: AgentChannel.name,
  properties: {
    addAgentFromDefinitionTiddlerTitle: ProxyPropertyType.Function,
    createAgentAndAdd: ProxyPropertyType.Function,
    getAgentDefinitionFromURI: ProxyPropertyType.Function,
    getAgentState: ProxyPropertyType.Function,
    listAgents: ProxyPropertyType.Function,
    serializeAgent: ProxyPropertyType.Function,
    serializeAgentState: ProxyPropertyType.Function,
    startAgent: ProxyPropertyType.Function,
    startWorkflows: ProxyPropertyType.Function,
    stopAgent: ProxyPropertyType.Function,
    subscribeAgentState$: ProxyPropertyType.Function$,
    updateAgentState: ProxyPropertyType.Function,
    sendMessageToAgent: ProxyPropertyType.Function,
    executeServiceAgent: ProxyPropertyType.Function,
  },
};
