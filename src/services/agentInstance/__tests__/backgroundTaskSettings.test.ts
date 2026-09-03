import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentInstanceService } from '../index';
import * as heartbeatManager from '../tools/scheduledTaskManager';

describe('AgentInstanceService background task settings APIs', () => {
  const findOneMock = vi.fn();
  const findMock = vi.fn();
  const updateMock = vi.fn();
  const getAgentDefMock = vi.fn();
  const updateAgentDefMock = vi.fn();
  let startHeartbeatSpy: ReturnType<typeof vi.spyOn>;
  let stopHeartbeatSpy: ReturnType<typeof vi.spyOn>;

  const createService = () => {
    const service = new AgentInstanceService();
    const mutableService = service as unknown as {
      agentInstanceRepository: {
        find: typeof findMock;
        findOne: typeof findOneMock;
        update: typeof updateMock;
      };
      agentMessageRepository: Record<string, unknown>;
      remoteScheduledTaskProjectionRepository: Record<string, unknown>;
      agentDefinitionService: {
        getAgentDef: typeof getAgentDefMock;
        updateAgentDef: typeof updateAgentDefMock;
      };
    };

    mutableService.agentInstanceRepository = {
      find: findMock,
      findOne: findOneMock,
      update: updateMock,
    };
    mutableService.agentMessageRepository = {};
    mutableService.remoteScheduledTaskProjectionRepository = {};
    mutableService.agentDefinitionService = {
      getAgentDef: getAgentDefMock,
      updateAgentDef: updateAgentDefMock,
    };

    return service;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    startHeartbeatSpy = vi.spyOn(heartbeatManager, 'startHeartbeat').mockImplementation(() => {
      // Avoid creating real timers in unit tests.
    });
    stopHeartbeatSpy = vi.spyOn(heartbeatManager, 'stopHeartbeat').mockImplementation(() => {
      // Avoid side effects in unit tests.
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enables heartbeat from settings UI and starts runtime heartbeat', async () => {
    findOneMock.mockResolvedValue({ id: 'agent-1', agentDefId: 'task-agent', volatile: false });
    getAgentDefMock.mockResolvedValue({
      id: 'task-agent',
      name: 'Task Agent',
      agentFrameworkConfig: {},
    });
    updateAgentDefMock.mockResolvedValue(undefined);

    const service = createService();

    await service.setAgentHeartbeat('agent-1', {
      enabled: true,
      intervalSeconds: 60,
      message: 'Heartbeat from settings',
      activeHoursStart: '09:00',
      activeHoursEnd: '18:00',
    });

    expect(updateAgentDefMock).toHaveBeenCalledWith({
      id: 'task-agent',
      heartbeat: {
        enabled: true,
        intervalSeconds: 60,
        message: 'Heartbeat from settings',
        activeHoursStart: '09:00',
        activeHoursEnd: '18:00',
      },
    });
    expect(startHeartbeatSpy).toHaveBeenCalledWith(
      'agent-1',
      'task-agent',
      {
        enabled: true,
        intervalSeconds: 60,
        message: 'Heartbeat from settings',
        activeHoursStart: '09:00',
        activeHoursEnd: '18:00',
      },
      service,
      { createdBy: 'settings-ui' },
    );
    expect(stopHeartbeatSpy).not.toHaveBeenCalled();
  });

  it('disables heartbeat from settings UI and stops runtime heartbeat', async () => {
    findOneMock.mockResolvedValue({ id: 'agent-1', agentDefId: 'task-agent', volatile: false });
    getAgentDefMock.mockResolvedValue({
      id: 'task-agent',
      name: 'Task Agent',
      agentFrameworkConfig: {},
    });
    updateAgentDefMock.mockResolvedValue(undefined);

    const service = createService();

    await service.setAgentHeartbeat('agent-1', {
      enabled: false,
      intervalSeconds: 300,
      message: 'Disable heartbeat',
    });

    expect(stopHeartbeatSpy).toHaveBeenCalledWith('agent-1');
    expect(startHeartbeatSpy).not.toHaveBeenCalled();
  });

  it('restores heartbeats while unified scheduled tasks restore separately', async () => {
    findMock.mockResolvedValue([
      {
        id: 'agent-1',
        agentDefId: 'task-agent',
        closed: false,
        volatile: false,
        agentDefinition: {
          heartbeat: {
            enabled: true,
            intervalSeconds: 120,
            message: 'Restore heartbeat',
          },
        },
      },
    ]);

    const service = createService();

    await (service as unknown as { restoreBackgroundTasks: () => Promise<void> }).restoreBackgroundTasks();

    expect(startHeartbeatSpy).toHaveBeenCalledWith(
      'agent-1',
      'task-agent',
      {
        enabled: true,
        intervalSeconds: 120,
        message: 'Restore heartbeat',
      },
      service,
      { createdBy: 'agent-definition' },
    );
  });
});
