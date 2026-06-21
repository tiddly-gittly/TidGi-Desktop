import type { AgentDefinition } from 'memeloop';
import { createAgentInstanceFromDefinition } from 'memeloop';
import { describe, expect, it } from 'vitest';

describe('createAgentInstanceFromDefinition', () => {
  it('should create agent instance from definition', () => {
    const agentDefinition = {
      id: 'test-agent-def',
      name: 'Test Agent',
      agentFrameworkConfig: undefined,
      agentFrameworkID: 'memeloopAgentToolLoop',
      tools: [],
      version: '1',
      description: '',
      systemPrompt: '',
    } as unknown as AgentDefinition;

    const instanceData = createAgentInstanceFromDefinition(agentDefinition, {
      id: 'instance-1',
    });

    expect(instanceData.agentFrameworkConfig).toBeUndefined();
    expect(instanceData.agentDefId).toBe('test-agent-def');
    expect(instanceData.agentFrameworkID).toBe('memeloopAgentToolLoop');
    expect(instanceData.name).toContain('Test Agent');
    expect(instanceData.messages).toEqual([]);
    expect(instanceData.status.state).toBe('completed');
  });
});
