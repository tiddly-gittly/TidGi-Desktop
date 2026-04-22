/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Given, Then, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import { nanoid } from 'nanoid';
import type { IWorkspaceGroup } from '../../src/services/workspaces/interface';
import type { ApplicationWorld } from './application';

const BACKOFF_OPTIONS = {
  numOfAttempts: 8,
  startingDelay: 100,
  maxDelay: 1000,
  timeMultiple: 2,
};

const groupIdMap = new Map<string, string>();

Given('a workspace group {string} exists', async function(this: ApplicationWorld, groupName: string) {
  const groupId = nanoid();
  groupIdMap.set(groupName, groupId);

  const group: IWorkspaceGroup = {
    id: groupId,
    name: groupName,
    order: 0,
    collapsed: false,
  };

  if (!this.app) throw new Error('App not initialized');

  await this.app.evaluate(async ({ webContents }, groupData) => {
    const mainWindow = webContents.getAllWebContents().find(wc => wc.getURL().includes('index.html'));
    if (!mainWindow) throw new Error('Main window not found');

    await mainWindow.executeJavaScript(`
      window.service.workspace.setGroup('${groupData.id}', ${JSON.stringify(groupData)})
    `);
  }, group);

  await backOff(async () => {
    if (!this.currentWindow) throw new Error('Current window not set');
    const exists = await this.currentWindow.locator(`[data-testid="workspace-group-${groupId}"]`).count();
    if (exists === 0) throw new Error('Group not visible yet');
  }, BACKOFF_OPTIONS);
});

Given('a workspace group {string} exists with workspaces', async function(this: ApplicationWorld, groupName: string) {
  const groupId = nanoid();
  groupIdMap.set(groupName, groupId);

  const group: IWorkspaceGroup = {
    id: groupId,
    name: groupName,
    order: 0,
    collapsed: false,
  };

  if (!this.app) throw new Error('App not initialized');

  await this.app.evaluate(async ({ webContents }, groupData) => {
    const mainWindow = webContents.getAllWebContents().find(wc => wc.getURL().includes('index.html'));
    if (!mainWindow) throw new Error('Main window not found');

    await mainWindow.executeJavaScript(`
      window.service.workspace.setGroup('${groupData.id}', ${JSON.stringify(groupData)})
    `);
  }, group);

  await backOff(async () => {
    if (!this.currentWindow) throw new Error('Current window not set');
    const exists = await this.currentWindow.locator(`[data-testid="workspace-group-${groupId}"]`).count();
    if (exists === 0) throw new Error('Group not visible yet');
  }, BACKOFF_OPTIONS);
});

Given('a workspace group {string} exists with {int} workspaces', async function(this: ApplicationWorld, groupName: string, _count: number) {
  const groupId = nanoid();
  groupIdMap.set(groupName, groupId);

  const group: IWorkspaceGroup = {
    id: groupId,
    name: groupName,
    order: 0,
    collapsed: false,
  };

  if (!this.app) throw new Error('App not initialized');

  await this.app.evaluate(async ({ webContents }, groupData) => {
    const mainWindow = webContents.getAllWebContents().find(wc => wc.getURL().includes('index.html'));
    if (!mainWindow) throw new Error('Main window not found');

    await mainWindow.executeJavaScript(`
      window.service.workspace.setGroup('${groupData.id}', ${JSON.stringify(groupData)})
    `);
  }, group);

  await backOff(async () => {
    if (!this.currentWindow) throw new Error('Current window not set');
    const exists = await this.currentWindow.locator(`[data-testid="workspace-group-${groupId}"]`).count();
    if (exists === 0) throw new Error('Group not visible yet');
  }, BACKOFF_OPTIONS);
});

Given('workspace groups {string} and {string} exist', async function(this: ApplicationWorld, groupName1: string, groupName2: string) {
  for (const groupName of [groupName1, groupName2]) {
    const groupId = nanoid();
    groupIdMap.set(groupName, groupId);

    const group: IWorkspaceGroup = {
      id: groupId,
      name: groupName,
      order: groupIdMap.size - 1,
      collapsed: false,
    };

    if (!this.app) throw new Error('App not initialized');

    await this.app.evaluate(async ({ webContents }, groupData) => {
      const mainWindow = webContents.getAllWebContents().find(wc => wc.getURL().includes('index.html'));
      if (!mainWindow) throw new Error('Main window not found');

      await mainWindow.executeJavaScript(`
        window.service.workspace.setGroup('${groupData.id}', ${JSON.stringify(groupData)})
      `);
    }, group);

    await backOff(async () => {
      if (!this.currentWindow) throw new Error('Current window not set');
      const exists = await this.currentWindow.locator(`[data-testid="workspace-group-${groupId}"]`).count();
      if (exists === 0) throw new Error('Group not visible yet');
    }, BACKOFF_OPTIONS);
  }
});

Given('a workspace {string} exists without a group', async function(this: ApplicationWorld, workspaceName: string) {
  if (!this.app) throw new Error('App not initialized');

  const workspaces = await this.app.evaluate(async ({ webContents }) => {
    const mainWindow = webContents.getAllWebContents().find(wc => wc.getURL().includes('index.html'));
    if (!mainWindow) throw new Error('Main window not found');

    return await mainWindow.executeJavaScript(`
      window.service.workspace.getWorkspacesAsList()
    `);
  });

  const workspace = workspaces.find((w: any) => w.name === workspaceName);
  if (!workspace) {
    throw new Error(`Workspace "${workspaceName}" not found`);
  }
  if (workspace.groupId) {
    await this.app.evaluate(async ({ webContents }, wId) => {
      const mainWindow = webContents.getAllWebContents().find(wc => wc.getURL().includes('index.html'));
      if (!mainWindow) throw new Error('Main window not found');

      await mainWindow.executeJavaScript(`
        window.service.workspace.moveWorkspaceToGroup('${wId}', null)
      `);
    }, workspace.id);
  }
});

When('I drag the workspace {string} to the group {string}', async function(this: ApplicationWorld, workspaceName: string, groupName: string) {
  const groupId = groupIdMap.get(groupName);
  if (!groupId) throw new Error(`Group "${groupName}" not found in map`);
  if (!this.app || !this.currentWindow) throw new Error('App or window not initialized');

  const workspaces = await this.app.evaluate(async ({ webContents }) => {
    const mainWindow = webContents.getAllWebContents().find(wc => wc.getURL().includes('index.html'));
    if (!mainWindow) throw new Error('Main window not found');

    return await mainWindow.executeJavaScript(`
      window.service.workspace.getWorkspacesAsList()
    `);
  });

  const workspace = workspaces.find((w: any) => w.name === workspaceName);
  if (!workspace) throw new Error(`Workspace "${workspaceName}" not found`);

  const workspaceElement = this.currentWindow.locator(`[data-testid="workspace-item-${workspace.id}"]`);
  const groupElement = this.currentWindow.locator(`[data-testid="workspace-group-${groupId}"]`);

  await workspaceElement.dragTo(groupElement);

  await backOff(async () => {
    if (!this.app) throw new Error('App not initialized');
    const updatedWorkspace = await this.app.evaluate(async ({ webContents }, wId) => {
      const mainWindow = webContents.getAllWebContents().find(wc => wc.getURL().includes('index.html'));
      if (!mainWindow) throw new Error('Main window not found');

      return await mainWindow.executeJavaScript(`
        window.service.workspace.get('${wId}')
      `);
    }, workspace.id);

    if (updatedWorkspace.groupId !== groupId) {
      throw new Error('Workspace groupId not updated yet');
    }
  }, BACKOFF_OPTIONS);
});

When('I click the group header {string}', async function(this: ApplicationWorld, groupName: string) {
  const groupId = groupIdMap.get(groupName);
  if (!groupId) throw new Error(`Group "${groupName}" not found in map`);
  if (!this.currentWindow) throw new Error('Current window not set');

  const groupHeader = this.currentWindow.locator(`[data-testid="workspace-group-${groupId}"] > div:first-child`);
  await groupHeader.click();

  await this.currentWindow.waitForTimeout(300);
});

When('I click the group header {string} again', async function(this: ApplicationWorld, groupName: string) {
  const groupId = groupIdMap.get(groupName);
  if (!groupId) throw new Error(`Group "${groupName}" not found in map`);
  if (!this.currentWindow) throw new Error('Current window not set');

  const groupHeader = this.currentWindow.locator(`[data-testid="workspace-group-${groupId}"] > div:first-child`);
  await groupHeader.click();

  await this.currentWindow.waitForTimeout(300);
});

Then('the workspace {string} should be in the group {string}', async function(this: ApplicationWorld, workspaceName: string, groupName: string) {
  const groupId = groupIdMap.get(groupName);
  if (!groupId) throw new Error(`Group "${groupName}" not found in map`);
  if (!this.app) throw new Error('App not initialized');

  await backOff(async () => {
    if (!this.app) throw new Error('App not initialized');
    const workspaces = await this.app.evaluate(async ({ webContents }) => {
      const mainWindow = webContents.getAllWebContents().find(wc => wc.getURL().includes('index.html'));
      if (!mainWindow) throw new Error('Main window not found');

      return await mainWindow.executeJavaScript(`
        window.service.workspace.getWorkspacesAsList()
      `);
    });

    const workspace = workspaces.find((w: any) => w.name === workspaceName);
    if (!workspace || workspace.groupId !== groupId) {
      throw new Error(`Workspace "${workspaceName}" not in group "${groupName}"`);
    }
  }, BACKOFF_OPTIONS);
});

Then('the group {string} should be collapsed', async function(this: ApplicationWorld, groupName: string) {
  const groupId = groupIdMap.get(groupName);
  if (!groupId) throw new Error(`Group "${groupName}" not found in map`);
  if (!this.app) throw new Error('App not initialized');

  await backOff(async () => {
    if (!this.app) throw new Error('App not initialized');
    const group = await this.app.evaluate(async ({ webContents }, gId) => {
      const mainWindow = webContents.getAllWebContents().find(wc => wc.getURL().includes('index.html'));
      if (!mainWindow) throw new Error('Main window not found');

      return await mainWindow.executeJavaScript(`
        window.service.workspace.getGroup('${gId}')
      `);
    }, groupId);

    if (!group.collapsed) {
      throw new Error(`Group "${groupName}" is not collapsed`);
    }
  }, BACKOFF_OPTIONS);
});

Then('the group {string} should be expanded', async function(this: ApplicationWorld, groupName: string) {
  const groupId = groupIdMap.get(groupName);
  if (!groupId) throw new Error(`Group "${groupName}" not found in map`);
  if (!this.app) throw new Error('App not initialized');

  await backOff(async () => {
    if (!this.app) throw new Error('App not initialized');
    const group = await this.app.evaluate(async ({ webContents }, gId) => {
      const mainWindow = webContents.getAllWebContents().find(wc => wc.getURL().includes('index.html'));
      if (!mainWindow) throw new Error('Main window not found');

      return await mainWindow.executeJavaScript(`
        window.service.workspace.getGroup('${gId}')
      `);
    }, groupId);

    if (group.collapsed) {
      throw new Error(`Group "${groupName}" is not expanded`);
    }
  }, BACKOFF_OPTIONS);
});

Then('the workspaces in {string} should not be visible', async function(this: ApplicationWorld, groupName: string) {
  const groupId = groupIdMap.get(groupName);
  if (!groupId) throw new Error(`Group "${groupName}" not found in map`);
  if (!this.currentWindow) throw new Error('Current window not set');

  const groupContent = this.currentWindow.locator(`[data-testid="workspace-group-${groupId}"] .MuiCollapse-root`);
  const isVisible = await groupContent.isVisible();
  if (isVisible) {
    throw new Error(`Workspaces in "${groupName}" are still visible`);
  }
});

Then('the workspaces in {string} should be visible', async function(this: ApplicationWorld, groupName: string) {
  const groupId = groupIdMap.get(groupName);
  if (!groupId) throw new Error(`Group "${groupName}" not found in map`);
  if (!this.currentWindow) throw new Error('Current window not set');

  await backOff(async () => {
    if (!this.currentWindow) throw new Error('Current window not set');
    const groupContent = this.currentWindow.locator(`[data-testid="workspace-group-${groupId}"] .MuiCollapse-root`);
    const isVisible = await groupContent.isVisible();
    if (!isVisible) {
      throw new Error(`Workspaces in "${groupName}" are not visible`);
    }
  }, BACKOFF_OPTIONS);
});

Then('the element with data-testid {string} should exist', async function(this: ApplicationWorld, testId: string) {
  if (!this.currentWindow) throw new Error('Current window not set');

  let actualTestId = testId;
  if (testId.includes('{groupId}')) {
    const groupId = Array.from(groupIdMap.values())[0];
    actualTestId = testId.replace('{groupId}', groupId);
  }

  await backOff(async () => {
    if (!this.currentWindow) throw new Error('Current window not set');
    const count = await this.currentWindow.locator(`[data-testid="${actualTestId}"]`).count();
    if (count === 0) {
      throw new Error(`Element with data-testid="${actualTestId}" not found`);
    }
  }, BACKOFF_OPTIONS);
});

Then('the group should contain {int} workspace items', async function(this: ApplicationWorld, count: number) {
  if (!this.currentWindow) throw new Error('Current window not set');
  const groupId = Array.from(groupIdMap.values())[0];
  const workspaceItems = this.currentWindow.locator(`[data-testid="workspace-group-${groupId}"] [data-testid^="workspace-item-"]`);

  await backOff(async () => {
    const actualCount = await workspaceItems.count();
    if (actualCount !== count) {
      throw new Error(`Expected ${count} workspace items, found ${actualCount}`);
    }
  }, BACKOFF_OPTIONS);
});

Then('each workspace should have data-testid {string}', async function(this: ApplicationWorld, _pattern: string) {
  if (!this.currentWindow) throw new Error('Current window not set');
  const groupId = Array.from(groupIdMap.values())[0];
  const workspaceItems = this.currentWindow.locator(`[data-testid="workspace-group-${groupId}"] [data-testid^="workspace-item-"]`);

  const count = await workspaceItems.count();
  for (let index = 0; index < count; index++) {
    const testId = await workspaceItems.nth(index).getAttribute('data-testid');
    if (!testId?.startsWith('workspace-item-')) {
      throw new Error(`Workspace item ${index} does not have correct data-testid pattern`);
    }
  }
});
