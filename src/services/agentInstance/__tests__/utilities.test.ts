import { describe, expect, it } from 'vitest';
import { createAgentInstanceData } from '../utilities';

describe('createAgentInstanceData', () => {
  it('should create agent instance with undefined agentFrameworkConfig (fallback to definition)', () => {
    const agentDefinition = {
      id: 'test-agent-def',
      name: 'Test Agent',
      agentFrameworkConfig: {
        prompts: [
          {
            text: 'You are a helpful assistant.',
            role: 'system',
          },
        ],
      },
      agentFrameworkID: 'basicPromptConcatHandler',
    };

    const { instanceData } = createAgentInstanceData(agentDefinition);

    expect(instanceData.agentFrameworkConfig).toBeUndefined();
    expect(instanceData.agentDefId).toBe('test-agent-def');
    expect(instanceData.agentFrameworkID).toBe('basicPromptConcatHandler');
    expect(instanceData.name).toContain('Test Agent');
  });

  it('should create agent instance with undefined agentFrameworkConfig even when definition has required agentFrameworkConfig', () => {
    const agentDefinition = {
      id: 'test-agent-def-no-config',
      name: 'Test Agent No Config',
      agentFrameworkID: 'basicPromptConcatHandler',
      agentFrameworkConfig: {}, // Required by AgentDefinition interface
    };

    const { instanceData } = createAgentInstanceData(agentDefinition);

    expect(instanceData.agentFrameworkConfig).toBeUndefined();
    expect(instanceData.agentDefId).toBe('test-agent-def-no-config');
    expect(instanceData.agentFrameworkID).toBe('basicPromptConcatHandler');
  });
});
