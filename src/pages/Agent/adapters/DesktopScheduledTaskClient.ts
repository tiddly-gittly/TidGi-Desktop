/**
 * DesktopScheduledTaskClient — wraps scheduled task IPC methods
 * to implement the headless ScheduledTaskClient interface.
 */

import type { ScheduledTask as DesktopScheduledTask } from '@services/agentInstance/tools/scheduledTaskTypes';
import type { ScheduledTask, ScheduledTaskClient } from 'memeloop';

const toScheduledTask = (task: DesktopScheduledTask): ScheduledTask => ({
  id: task.id,
  agentInstanceId: task.agentInstanceId,
  agentDefinitionId: task.agentDefinitionId ?? task.agentInstanceId,
  name: task.name ?? task.id,
  schedule: task.schedule,
  payload: task.payload,
  activeHoursStart: task.activeHoursStart,
  activeHoursEnd: task.activeHoursEnd,
  enabled: task.enabled,
  createdBy: task.createdBy,
});

/**
 * Desktop implementation of ScheduledTaskClient.
 * Delegates to window.service.agentInstance IPC methods.
 */
export const createDesktopScheduledTaskClient = (): ScheduledTaskClient => ({
  listScheduledTasksForAgent: async agentInstanceId => (await window.service.agentInstance.listScheduledTasksForAgent(agentInstanceId)).map(toScheduledTask),

  createScheduledTask: async input => toScheduledTask(await window.service.agentInstance.createScheduledTask(input)),

  updateScheduledTask: async (id, input) => toScheduledTask(await window.service.agentInstance.updateScheduledTask({ id, ...input })),

  deleteScheduledTask: async id => {
    await window.service.agentInstance.deleteScheduledTask(id);
  },

  getCronPreviewDates: async (expression, timezone, count) => await window.service.agentInstance.getCronPreviewDates(expression, timezone, count),
});
