import { When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { ApplicationWorld } from './application';

When('I schedule a one-shot message for the current test conversation', async function(this: ApplicationWorld) {
  assert(this.currentWindow);
  await this.currentWindow.evaluate(async () => {
    const agents = await window.service.agentInstance.getAgents(1, 20, { closed: false });
    if (agents.length !== 1) throw new Error(`Expected one test conversation, received ${agents.length}`);
    const agent = agents[0];
    const identity = await window.service.deviceNetwork.getLocalIdentity();
    await window.service.agentInstance.createScheduledTask({
      agentInstanceId: agent.id,
      agentDefinitionId: agent.agentDefId,
      name: 'SCHEDULE_ACCEPTANCE',
      scheduleKind: 'at',
      schedule: { kind: 'at', wakeAtISO: new Date(Date.now() + 1_000).toISOString() },
      payload: { message: 'SCHEDULE_ACCEPTANCE_REQUEST' },
      executionNodeId: identity.peerId,
      originNodeId: identity.peerId,
    });
  });
});
