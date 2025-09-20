import { describe, expect, it } from 'vitest';
import { createAgentInstanceData } from '../utilities';

describe('createAgentInstanceData', () => {
  it('should create agent instance with undefined handlerConfig (fallback to definition)', () => {
    const agentDefinition = {
      id: 'test-agent-def',
      name: 'Test Agent',
      handlerConfig: {
        prompts: [
          {
            text: 'You are a helpful assistant.',
            role: 'system',
          },
        ],
      },
      handlerID: 'basicPromptConcatHandler',
    };

    const { instanceData } = createAgentInstanceData(agentDefinition);

    expect(instanceData.handlerConfig).toBeUndefined();
    expect(instanceData.agentDefId).toBe('test-agent-def');
    expect(instanceData.handlerID).toBe('basicPromptConcatHandler');
    expect(instanceData.name).toContain('Test Agent');
  });

  it('should create agent instance with undefined handlerConfig even when definition has required handlerConfig', () => {
    const agentDefinition = {
      id: 'test-agent-def-no-config',
      name: 'Test Agent No Config',
      handlerID: 'basicPromptConcatHandler',
      handlerConfig: {}, // Required by AgentDefinition interface
    };

    const { instanceData } = createAgentInstanceData(agentDefinition);

    expect(instanceData.handlerConfig).toBeUndefined();
    expect(instanceData.agentDefId).toBe('test-agent-def-no-config');
    expect(instanceData.handlerID).toBe('basicPromptConcatHandler');
  });
});
