import type { AgentDefinition } from 'memeloop';
import { describe, expect, it } from 'vitest';
import { createAgentInstanceData } from '../utilities';

describe('createAgentInstanceData', () => {
  it('should create agent instance with undefined agentFrameworkConfig (fallback to definition)', () => {
    const agentDefinition = {
      id: 'test-agent-def',
      name: 'Test Agent',
      agentFrameworkConfig: undefined,
      agentFrameworkID: 'memeloopTaskAgent',
    };

    const { instanceData } = createAgentInstanceData(agentDefinition as unknown as AgentDefinition);

    expect(instanceData.agentFrameworkConfig).toBeUndefined();
    expect(instanceData.agentDefId).toBe('test-agent-def');
    expect(instanceData.agentFrameworkID).toBe('memeloopTaskAgent');
    expect(instanceData.name).toContain('Test Agent');
  });

  it('should create agent instance with undefined agentFrameworkConfig even when definition has required agentFrameworkConfig', () => {
    const agentDefinition = {
      id: 'test-agent-def-no-config',
      name: 'Test Agent No Config',
      agentFrameworkID: 'memeloopTaskAgent',
      agentFrameworkConfig: undefined,
    };

    const { instanceData } = createAgentInstanceData(agentDefinition as unknown as AgentDefinition);

    expect(instanceData.agentFrameworkConfig).toBeUndefined();
    expect(instanceData.agentDefId).toBe('test-agent-def-no-config');
    expect(instanceData.agentFrameworkID).toBe('memeloopTaskAgent');
  });
});
