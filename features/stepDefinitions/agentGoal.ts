import { Then, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import assert from 'node:assert/strict';
import path from 'node:path';
import { captureWindowScreenshot } from '../supports/webContentsViewHelper';
import type { ApplicationWorld } from './application';

Then('the goal should persist two rounds and explicit completion evidence', async function(this: ApplicationWorld) {
  const page = this.currentWindow;
  assert(page && this.app && this.mockOpenAIServer);
  await backOff(async () => {
    const goal = await page.evaluate(async () => {
      const agents = await window.service.agentInstance.getAgents(1, 20, { closed: false });
      if (agents.length !== 1) throw new Error(`Expected one test conversation, received ${agents.length}`);
      return window.service.agentInstance.getGoal(agents[0].id);
    });
    assert(goal);
    assert.equal(goal.objective, 'GOAL_ACCEPTANCE: Complete a two-round interface check.');
    assert.equal(goal.status, 'completed');
    assert.equal(goal.round, 2);
    assert.equal(goal.evidence, 'GOAL_VERIFIED_TWO_ROUNDS');
  }, { numOfAttempts: 30, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
  const requests = this.mockOpenAIServer.getAllRequests();
  assert(
    requests.some(request => JSON.stringify(request.messages).includes('GOAL_FIRST_ROUND_PROGRESS')),
    'The next goal round receives the previous round in its actual model request',
  );
  for (const request of requests) {
    const userMessages = request.messages.filter(message => message.role === 'user');
    assert(userMessages.every(message => message.content === 'GOAL_ACCEPTANCE: Complete a two-round interface check.'), 'Goal rounds preserve the objective as the user message');
  }
  assert(
    requests.slice(0, 2).every(request => request.messages.some(message => message.role === 'system' && message.content?.includes('verification evidence'))),
    'Active goal rounds receive lifecycle instructions in the system prompt',
  );
  assert(await captureWindowScreenshot(this.app, page, path.resolve('test-artifacts', this.scenarioSlug, 'goal-completed.png')));
});

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

Then('the scheduled message should have completed once', async function(this: ApplicationWorld) {
  assert(this.currentWindow && this.app);
  const page = this.currentWindow;
  await backOff(async () => {
    const tasks = await page.evaluate(async () => await window.service.agentInstance.listScheduledTasks({ states: ['completed'], limit: 10 }));
    const task = tasks.find(candidate => candidate.name === 'SCHEDULE_ACCEPTANCE');
    assert(task);
    assert.equal(task.runCount, 1);
    assert.equal(task.lastRunStatus, 'succeeded');
    assert.equal(task.enabled, false);
  }, { numOfAttempts: 30, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
  assert(await captureWindowScreenshot(this.app, page, path.resolve('test-artifacts', this.scenarioSlug, 'scheduled-result.png')));
});
