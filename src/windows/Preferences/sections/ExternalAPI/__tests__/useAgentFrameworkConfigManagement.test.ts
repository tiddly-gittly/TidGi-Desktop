import { act, renderHook, waitFor } from '@testing-library/react';
import type { AgentFrameworkConfig } from 'memeloop';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentFrameworkConfigManagement } from '../useAgentFrameworkConfigManagement';

const initialConfig: AgentFrameworkConfig = { prompts: [], plugins: [] };

describe('useAgentFrameworkConfigManagement', () => {
  let getAgentDef: ReturnType<typeof vi.fn>;
  let updateAgentDef: ReturnType<typeof vi.fn>;
  let getFrameworkConfigSchema: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getAgentDef = vi.fn().mockResolvedValue({
      id: 'definition-1',
      agentFrameworkID: 'agent-tool-loop',
      agentFrameworkConfig: initialConfig,
    });
    updateAgentDef = vi.fn().mockResolvedValue(undefined);
    getFrameworkConfigSchema = vi.fn().mockResolvedValue({ type: 'object' });
    Object.defineProperty(window.service, 'agentDefinition', {
      value: { getAgentDef, updateAgentDef },
      writable: true,
    });
    Object.defineProperty(window.service, 'agentInstance', {
      value: { getFrameworkConfigSchema },
      writable: true,
    });
  });

  it('rolls back local framework config and exposes an update failure when persistence rejects', async () => {
    updateAgentDef.mockRejectedValueOnce(new Error('backend rejected framework config'));
    const { result } = renderHook(() => useAgentFrameworkConfigManagement({ agentDefId: 'definition-1' }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const changedConfig: AgentFrameworkConfig = {
      prompts: [{ id: 'prompt-1', text: 'changed' }],
      plugins: [],
    };
    await act(async () => {
      await expect(result.current.handleConfigChange(changedConfig)).rejects.toThrow('backend rejected framework config');
    });

    expect(result.current.config).toEqual(initialConfig);
    expect(result.current.error).toMatchObject({
      operation: 'update',
      error: expect.any(Error),
    });
  });

  it('does not silently succeed without an agent target', async () => {
    const { result } = renderHook(() => useAgentFrameworkConfigManagement());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await expect(result.current.persistConfig(initialConfig)).rejects.toThrow('agent ID or definition ID');
    });
    expect(result.current.error).toMatchObject({ operation: 'update', error: expect.any(Error) });
  });
});
