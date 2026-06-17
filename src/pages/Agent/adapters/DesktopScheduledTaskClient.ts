/**
 * DesktopScheduledTaskClient — wraps scheduled task IPC methods
 * to implement the headless ScheduledTaskClient interface.
 */

import type { CreateScheduledTaskInput, ScheduledTask, ScheduledTaskClient } from 'memeloop';

/**
 * Desktop implementation of ScheduledTaskClient.
 * Delegates to window.service.agentInstance IPC methods.
 */
export const createDesktopScheduledTaskClient = (): ScheduledTaskClient => ({
  listScheduledTasksForAgent: async (agentInstanceId) => {
    const service = window.service.agentInstance as unknown as {
      listScheduledTasksForAgent: (id: string) => Promise<ScheduledTask[]>;
    };
    return service.listScheduledTasksForAgent(agentInstanceId);
  },

  createScheduledTask: async (input) => {
    const service = window.service.agentInstance as unknown as {
      createScheduledTask: (input: CreateScheduledTaskInput) => Promise<ScheduledTask>;
    };
    return service.createScheduledTask(input);
  },

  updateScheduledTask: async (id, input) => {
    const service = window.service.agentInstance as unknown as {
      updateScheduledTask: (id: string, input: Partial<CreateScheduledTaskInput>) => Promise<ScheduledTask>;
    };
    return service.updateScheduledTask(id, input);
  },

  deleteScheduledTask: async (id) => {
    const service = window.service.agentInstance as unknown as {
      deleteScheduledTask: (id: string) => Promise<void>;
    };
    return service.deleteScheduledTask(id);
  },

  getCronPreviewDates: async (expression, timezone, count) => {
    const service = window.service.agentInstance as unknown as {
      getCronPreviewDates: (expr: string, tz?: string, count?: number) => Promise<string[]>;
    };
    return service.getCronPreviewDates(expression, timezone, count);
  },
});
