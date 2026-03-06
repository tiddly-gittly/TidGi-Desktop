import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as heartbeatManager from '../heartbeatManager';
import { AgentInstanceService } from '../index';
import * as alarmClock from '../tools/alarmClock';

describe('AgentInstanceService background task settings APIs', () => {
  const findOneMock = vi.fn();
  const findMock = vi.fn();
  const updateMock = vi.fn();
  const getAgentDefMock = vi.fn();
  const updateAgentDefMock = vi.fn();
  let scheduleAlarmTimerSpy: ReturnType<typeof vi.spyOn>;
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
    mutableService.agentDefinitionService = {
      getAgentDef: getAgentDefMock,
      updateAgentDef: updateAgentDefMock,
    };

    return service;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    scheduleAlarmTimerSpy = vi.spyOn(alarmClock, 'scheduleAlarmTimer').mockImplementation(() => {
      // Avoid creating real timers in unit tests.
    });
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

  it('upserts alarm task from settings UI with metadata', async () => {
    findOneMock.mockResolvedValue({ id: 'agent-1', agentDefId: 'task-agent', volatile: false });
    updateMock.mockResolvedValue(undefined);
    const service = createService();

    await service.setBackgroundAlarm('agent-1', {
      wakeAtISO: '2026-03-06T10:00:00.000Z',
      message: 'Run follow-up check',
      repeatIntervalMinutes: 30,
    });

    expect(scheduleAlarmTimerSpy).toHaveBeenCalledWith(
      'agent-1',
      '2026-03-06T10:00:00.000Z',
      'Run follow-up check',
      30,
      { createdBy: 'settings-ui', runCount: 0 },
    );
    expect(updateMock).toHaveBeenCalledWith('agent-1', {
      scheduledAlarm: {
        wakeAtISO: '2026-03-06T10:00:00.000Z',
        reminderMessage: 'Run follow-up check',
        repeatIntervalMinutes: 30,
        createdBy: 'settings-ui',
        runCount: 0,
      },
    });
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

    await service.setBackgroundHeartbeat('agent-1', {
      enabled: true,
      intervalSeconds: 10,
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

    await service.setBackgroundHeartbeat('agent-1', {
      enabled: false,
      intervalSeconds: 300,
      message: 'Disable heartbeat',
    });

    expect(stopHeartbeatSpy).toHaveBeenCalledWith('agent-1');
    expect(startHeartbeatSpy).not.toHaveBeenCalled();
  });

  it('restores heartbeat and alarm tasks on startup with metadata', async () => {
    findMock.mockResolvedValue([
      {
        id: 'agent-1',
        closed: false,
        volatile: false,
        agentDefinition: {
          heartbeat: {
            enabled: true,
            intervalSeconds: 120,
            message: 'Restore heartbeat',
          },
        },
        scheduledAlarm: {
          wakeAtISO: '2099-01-01T00:00:00.000Z',
          reminderMessage: 'Restore alarm',
          repeatIntervalMinutes: 60,
          createdBy: 'settings-ui',
          runCount: 4,
          lastRunAtISO: '2026-03-06T00:00:00.000Z',
        },
      },
    ]);

    const service = createService();

    await (service as unknown as { restoreBackgroundTasks: () => Promise<void> }).restoreBackgroundTasks();

    expect(startHeartbeatSpy).toHaveBeenCalledWith(
      'agent-1',
      {
        enabled: true,
        intervalSeconds: 120,
        message: 'Restore heartbeat',
      },
      service,
      { createdBy: 'agent-definition' },
    );

    expect(scheduleAlarmTimerSpy).toHaveBeenCalledWith(
      'agent-1',
      '2099-01-01T00:00:00.000Z',
      'Restore alarm',
      60,
      {
        createdBy: 'settings-ui',
        runCount: 4,
        lastRunAtISO: '2026-03-06T00:00:00.000Z',
      },
    );
  });
});
