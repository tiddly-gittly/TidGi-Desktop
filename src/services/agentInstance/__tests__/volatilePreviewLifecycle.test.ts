import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as repository from '../agentRepository';
import { AgentInstanceService } from '../index';
import * as modelContextProtocol from '../tools/modelContextProtocol';
import * as scheduledTaskManager from '../tools/scheduledTaskManager';

describe('AgentInstanceService volatile preview lifecycle', () => {
  const findOne = vi.fn();
  const cancelRuntime = vi.fn();
  const releaseConversationScope = vi.fn();
  let discardRepository: ReturnType<typeof vi.spyOn>;
  let stopHeartbeat: ReturnType<typeof vi.spyOn>;
  let cancelTasks: ReturnType<typeof vi.spyOn>;
  let cleanupMCP: ReturnType<typeof vi.spyOn>;

  const createService = () => {
    const service = new AgentInstanceService();
    const mutable = service as unknown as Record<string, unknown>;
    mutable.dataSource = {};
    mutable.agentInstanceRepository = { findOne };
    mutable.agentMessageRepository = {};
    mutable.attachmentUploadStore = { releaseConversationScope };
    vi.spyOn(service, 'getDurableAgentRuntime').mockResolvedValue({ cancelAgent: cancelRuntime } as never);
    return service;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    discardRepository = vi.spyOn(repository, 'discardVolatileAgentPreview').mockResolvedValue();
    stopHeartbeat = vi.spyOn(scheduledTaskManager, 'stopHeartbeat').mockImplementation(() => undefined);
    cancelTasks = vi.spyOn(scheduledTaskManager, 'cancelTasksForAgent').mockResolvedValue();
    cleanupMCP = vi.spyOn(modelContextProtocol, 'cleanupMCPClient').mockResolvedValue();
    releaseConversationScope.mockResolvedValue(undefined);
    cancelRuntime.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('releases every runtime capability before the transactional purge and stays idempotent', async () => {
    findOne
      .mockResolvedValueOnce({ id: 'preview', agentDefId: 'temp-definition', volatile: true, preview: true })
      .mockResolvedValueOnce(undefined);
    const service = createService();
    const input = { agentId: 'preview', temporaryDefinitionId: 'temp-definition' };

    await service.discardVolatileAgentPreview(input);
    await service.discardVolatileAgentPreview(input);

    expect(stopHeartbeat).toHaveBeenCalledTimes(1);
    expect(cancelRuntime).toHaveBeenCalledTimes(1);
    expect(cancelRuntime).toHaveBeenCalledWith('preview');
    expect(cancelTasks).toHaveBeenCalledTimes(1);
    expect(cleanupMCP).toHaveBeenCalledTimes(1);
    expect(releaseConversationScope).toHaveBeenCalledTimes(1);
    expect(releaseConversationScope).toHaveBeenCalledWith('preview');
    expect(discardRepository).toHaveBeenCalledTimes(2);
    expect(discardRepository).toHaveBeenNthCalledWith(1, expect.anything(), input);

    const purgeCall = discardRepository.mock.invocationCallOrder[0]!;
    for (const runtimeRelease of [stopHeartbeat, cancelRuntime, cancelTasks, cleanupMCP, releaseConversationScope]) {
      expect(runtimeRelease.mock.invocationCallOrder[0]).toBeLessThan(purgeCall);
    }
  });

  it('fails closed before runtime mutation for durable instances and definition mismatches', async () => {
    findOne
      .mockResolvedValueOnce({ id: 'durable', agentDefId: 'durable-definition', volatile: false })
      .mockResolvedValueOnce({ id: 'preview', agentDefId: 'temp-a', volatile: true, preview: true });
    const service = createService();

    await expect(service.discardVolatileAgentPreview({ agentId: 'durable' }))
      .rejects.toThrow('Refusing to discard non-preview or non-volatile agent instance: durable');
    await expect(service.discardVolatileAgentPreview({ agentId: 'preview', temporaryDefinitionId: 'temp-b' }))
      .rejects.toThrow('Volatile preview does not belong to the supplied temporary definition');
    await expect(service.discardVolatileAgentPreview({ temporaryDefinitionId: 'durable-definition' }))
      .rejects.toThrow('Refusing to discard non-temporary agent definition: durable-definition');

    expect(stopHeartbeat).not.toHaveBeenCalled();
    expect(cancelRuntime).not.toHaveBeenCalled();
    expect(cancelTasks).not.toHaveBeenCalled();
    expect(cleanupMCP).not.toHaveBeenCalled();
    expect(releaseConversationScope).not.toHaveBeenCalled();
    expect(discardRepository).not.toHaveBeenCalled();
  });
});
