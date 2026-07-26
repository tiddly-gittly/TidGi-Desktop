import type { AgentDefinition } from '@services/agentDefinition/interface';

type SaveAgentDefinition = (definition: AgentDefinition) => Promise<AgentDefinition>;

export interface IAgentDefinitionSaveQueue {
  save(definition: AgentDefinition): Promise<AgentDefinition>;
  waitForIdle(): Promise<void>;
}

/**
 * Serialize agent-definition writes so an older IPC request can never finish
 * after a newer request and overwrite it. A rejected save does not block later
 * writes from running.
 */
export function createAgentDefinitionSaveQueue(saveAgentDefinition: SaveAgentDefinition): IAgentDefinitionSaveQueue {
  let tail: Promise<void> = Promise.resolve();

  return {
    save(definition: AgentDefinition): Promise<AgentDefinition> {
      const result = tail.then(async () => await saveAgentDefinition(definition));
      tail = result.then(
        () => {},
        () => {},
      );
      return result;
    },
    waitForIdle(): Promise<void> {
      return tail;
    },
  };
}
