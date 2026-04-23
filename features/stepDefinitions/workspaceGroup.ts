import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';

import type { IWorkspaceGroup } from '../../src/services/workspaces/interface';
import type { ApplicationWorld } from './application';

const BACKOFF_OPTIONS = {
  numOfAttempts: 8,
  startingDelay: 100,
  maxDelay: 1000,
  timeMultiple: 2,
};

interface ITestWorkspace {
  id: string;
  name: string;
  groupId?: string | null;
  order?: number;
  pageType?: string | null;
}

async function executeInMainWindow<T>(world: ApplicationWorld, script: string): Promise<T> {
  if (!world.app) {
    throw new Error('App not initialized');
  }

  return await world.app.evaluate(async ({ webContents }, code) => {
    const mainWindow = webContents.getAllWebContents().find(wc => wc.getURL().includes('index.html'));
    if (!mainWindow) {
      throw new Error('Main window not found');
    }

    return await mainWindow.executeJavaScript(code) as T;
  }, script);
}

async function getAllWikiWorkspaces(world: ApplicationWorld): Promise<ITestWorkspace[]> {
  return await executeInMainWindow<ITestWorkspace[]>(
    world,
    `
    (async () => {
      const all = await window.service.workspace.getWorkspacesAsList();
      return all.filter(workspace => !workspace.pageType);
    })();
  `,
  );
}

async function getWorkspaceByName(world: ApplicationWorld, workspaceName: string): Promise<ITestWorkspace> {
  const workspaces = await getAllWikiWorkspaces(world);
  const workspace = workspaces.find((candidate) => candidate.name === workspaceName);
  if (!workspace) {
    throw new Error(
      `Workspace "${workspaceName}" not found. Existing wiki workspaces: ${workspaces.map(candidate => candidate.name).join(', ')}`,
    );
  }

  return workspace;
}

async function getGroups(world: ApplicationWorld): Promise<IWorkspaceGroup[]> {
  return await executeInMainWindow<IWorkspaceGroup[]>(
    world,
    `
    window.service.workspace.getGroupsAsList()
  `,
  );
}

async function getGroupById(world: ApplicationWorld, groupId: string): Promise<IWorkspaceGroup | undefined> {
  return await executeInMainWindow<IWorkspaceGroup | undefined>(
    world,
    `
    window.service.workspace.getGroup(${JSON.stringify(groupId)})
  `,
  );
}

async function createGroup(world: ApplicationWorld, groupName: string): Promise<IWorkspaceGroup> {
  const groups = await getGroups(world);
  const newGroup: IWorkspaceGroup = {
    id: `test-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: groupName,
    order: groups.length,
    collapsed: false,
  };

  await executeInMainWindow<unknown>(
    world,
    `
    window.service.workspace.setGroup(${JSON.stringify(newGroup.id)}, ${JSON.stringify(newGroup)})
  `,
  );

  return newGroup;
}

async function waitForWorkspaceGroupId(world: ApplicationWorld, workspaceName: string, expectedGroupId: string | null): Promise<void> {
  await backOff(async () => {
    const workspace = await getWorkspaceByName(world, workspaceName);
    const actualGroupId = workspace.groupId ?? null;
    if (actualGroupId !== expectedGroupId) {
      throw new Error(`Workspace "${workspaceName}" groupId is ${String(actualGroupId)}, expected ${String(expectedGroupId)}`);
    }
  }, BACKOFF_OPTIONS);
}

async function waitForGroupVisibility(world: ApplicationWorld, groupId: string): Promise<void> {
  await backOff(async () => {
    if (!world.currentWindow) {
      throw new Error('Current window not set');
    }

    const count = await world.currentWindow.locator(`[data-testid="workspace-group-${groupId}"]`).count();
    if (count === 0) {
      throw new Error(`Group ${groupId} not visible yet`);
    }
  }, BACKOFF_OPTIONS);
}

async function dragLocatorToCoordinates(
  world: ApplicationWorld,
  sourceSelector: string,
  targetX: number,
  targetY: number,
): Promise<void> {
  if (!world.currentWindow) {
    throw new Error('Current window not set');
  }

  const sourceLocator = world.currentWindow.locator(sourceSelector);
  await sourceLocator.waitFor({ state: 'visible' });

  const sourceBox = await sourceLocator.boundingBox();
  if (!sourceBox) {
    throw new Error(`Could not read bounding box for ${sourceSelector}`);
  }

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  await world.currentWindow.mouse.move(startX, startY);
  await world.currentWindow.mouse.down();
  await world.currentWindow.mouse.move(startX + 12, startY + 12, { steps: 6 });
  await world.currentWindow.mouse.move(targetX, targetY, { steps: 20 });
  await world.currentWindow.mouse.up();
}

Given('workspace group {string} contains workspaces:', async function(this: ApplicationWorld, groupName: string, dataTable: DataTable) {
  const rows = dataTable.raw().map(([workspaceName]: string[]) => workspaceName).filter((workspaceName): workspaceName is string => Boolean(workspaceName));
  const group = await createGroup(this, groupName);

  for (const workspaceName of rows) {
    const workspace = await getWorkspaceByName(this, workspaceName);
    await executeInMainWindow<unknown>(
      this,
      `
      window.service.workspace.moveWorkspaceToGroup(${JSON.stringify(workspace.id)}, ${JSON.stringify(group.id)})
    `,
    );
    await waitForWorkspaceGroupId(this, workspaceName, group.id);
  }

  await waitForGroupVisibility(this, group.id);
});

When('I drag workspace {string} onto workspace {string}', async function(this: ApplicationWorld, sourceWorkspaceName: string, targetWorkspaceName: string) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  const sourceWorkspace = await getWorkspaceByName(this, sourceWorkspaceName);
  const targetWorkspace = await getWorkspaceByName(this, targetWorkspaceName);
  const targetSelector = `[data-testid="workspace-item-${targetWorkspace.id}"]`;
  const targetLocator = this.currentWindow.locator(targetSelector);
  await targetLocator.waitFor({ state: 'visible' });

  const targetBox = await targetLocator.boundingBox();
  if (!targetBox) {
    throw new Error(`Could not read bounding box for ${targetSelector}`);
  }

  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;
  await dragLocatorToCoordinates(this, `[data-testid="workspace-item-${sourceWorkspace.id}"]`, targetX, targetY);
});

When('I drag workspace {string} to the top zone of workspace {string}', async function(this: ApplicationWorld, sourceWorkspaceName: string, targetWorkspaceName: string) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  const sourceWorkspace = await getWorkspaceByName(this, sourceWorkspaceName);
  const targetWorkspace = await getWorkspaceByName(this, targetWorkspaceName);
  const targetSelector = `[data-testid="workspace-item-${targetWorkspace.id}"]`;
  const targetLocator = this.currentWindow.locator(targetSelector);
  await targetLocator.waitFor({ state: 'visible' });

  const targetBox = await targetLocator.boundingBox();
  if (!targetBox) {
    throw new Error(`Could not read bounding box for ${targetSelector}`);
  }

  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height * 0.15;
  await dragLocatorToCoordinates(this, `[data-testid="workspace-item-${sourceWorkspace.id}"]`, targetX, targetY);
});

When('I drag workspace {string} to the bottom zone of workspace {string}', async function(this: ApplicationWorld, sourceWorkspaceName: string, targetWorkspaceName: string) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  const sourceWorkspace = await getWorkspaceByName(this, sourceWorkspaceName);
  const targetWorkspace = await getWorkspaceByName(this, targetWorkspaceName);
  const targetSelector = `[data-testid="workspace-item-${targetWorkspace.id}"]`;
  const targetLocator = this.currentWindow.locator(targetSelector);
  await targetLocator.waitFor({ state: 'visible' });

  const targetBox = await targetLocator.boundingBox();
  if (!targetBox) {
    throw new Error(`Could not read bounding box for ${targetSelector}`);
  }

  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height * 0.85;
  await dragLocatorToCoordinates(this, `[data-testid="workspace-item-${sourceWorkspace.id}"]`, targetX, targetY);
});

When('I drag workspace {string} onto the header of its current group', async function(this: ApplicationWorld, workspaceName: string) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  const workspace = await getWorkspaceByName(this, workspaceName);
  if (!workspace.groupId) {
    throw new Error(`Workspace "${workspaceName}" is not currently grouped`);
  }

  const groupHeaderSelector = `[data-testid="workspace-group-${workspace.groupId}"]`;
  const groupHeaderLocator = this.currentWindow.locator(groupHeaderSelector);
  await groupHeaderLocator.waitFor({ state: 'visible' });

  const groupHeaderBox = await groupHeaderLocator.boundingBox();
  if (!groupHeaderBox) {
    throw new Error(`Could not read bounding box for ${groupHeaderSelector}`);
  }

  const targetX = groupHeaderBox.x + groupHeaderBox.width / 2;
  const targetY = groupHeaderBox.y + groupHeaderBox.height / 2;
  await dragLocatorToCoordinates(this, `[data-testid="workspace-item-${workspace.id}"]`, targetX, targetY);
});

When('I remove workspace {string} from its group without auto-disband', async function(this: ApplicationWorld, workspaceName: string) {
  const workspace = await getWorkspaceByName(this, workspaceName);
  if (!workspace.groupId) {
    throw new Error(`Workspace "${workspaceName}" is not currently grouped`);
  }

  await executeInMainWindow<unknown>(
    this,
    `
    window.service.workspace.moveWorkspaceToGroup(${JSON.stringify(workspace.id)}, null, false)
  `,
  );
});

Then('workspaces {string} and {string} should share a group', async function(this: ApplicationWorld, firstWorkspaceName: string, secondWorkspaceName: string) {
  await backOff(async () => {
    const [firstWorkspace, secondWorkspace] = await Promise.all([
      getWorkspaceByName(this, firstWorkspaceName),
      getWorkspaceByName(this, secondWorkspaceName),
    ]);

    if (!firstWorkspace.groupId || !secondWorkspace.groupId || firstWorkspace.groupId !== secondWorkspace.groupId) {
      throw new Error(`Workspaces "${firstWorkspaceName}" and "${secondWorkspaceName}" do not share a group yet`);
    }
  }, BACKOFF_OPTIONS);
});

Then('workspace {string} should be ungrouped', async function(this: ApplicationWorld, workspaceName: string) {
  await waitForWorkspaceGroupId(this, workspaceName, null);
});

Then('workspace {string} should be in a group', async function(this: ApplicationWorld, workspaceName: string) {
  await backOff(async () => {
    const workspace = await getWorkspaceByName(this, workspaceName);
    if (!workspace.groupId) {
      throw new Error(`Workspace "${workspaceName}" is not grouped`);
    }
  }, BACKOFF_OPTIONS);
});

Then('the group containing workspace {string} should contain {int} workspaces', async function(this: ApplicationWorld, workspaceName: string, expectedCount: number) {
  await backOff(async () => {
    const workspace = await getWorkspaceByName(this, workspaceName);
    if (!workspace.groupId) {
      throw new Error(`Workspace "${workspaceName}" is not in a group`);
    }

    const groupedWorkspaces = (await getAllWikiWorkspaces(this)).filter(candidate => candidate.groupId === workspace.groupId);
    if (groupedWorkspaces.length !== expectedCount) {
      throw new Error(`Expected ${expectedCount} workspaces in group ${workspace.groupId}, found ${groupedWorkspaces.length}`);
    }
  }, BACKOFF_OPTIONS);
});

Then('there should be {int} workspace groups', async function(this: ApplicationWorld, expectedCount: number) {
  await backOff(async () => {
    const groups = await getGroups(this);
    if (groups.length !== expectedCount) {
      throw new Error(`Expected ${expectedCount} workspace groups, found ${groups.length}`);
    }
  }, BACKOFF_OPTIONS);
});

Then('the group containing workspace {string} should still exist', async function(this: ApplicationWorld, workspaceName: string) {
  await backOff(async () => {
    const workspace = await getWorkspaceByName(this, workspaceName);
    if (!workspace.groupId) {
      throw new Error(`Workspace "${workspaceName}" is not in a group`);
    }

    const group = await getGroupById(this, workspace.groupId);
    if (!group) {
      throw new Error(`Group ${workspace.groupId} no longer exists`);
    }
  }, BACKOFF_OPTIONS);
});

Then('workspace {string} should appear before workspace {string}', async function(this: ApplicationWorld, firstWorkspaceName: string, secondWorkspaceName: string) {
  await backOff(async () => {
    const [firstWorkspace, secondWorkspace] = await Promise.all([
      getWorkspaceByName(this, firstWorkspaceName),
      getWorkspaceByName(this, secondWorkspaceName),
    ]);

    const firstOrder = firstWorkspace.order ?? 0;
    const secondOrder = secondWorkspace.order ?? 0;

    if (firstOrder >= secondOrder) {
      throw new Error(`Workspace "${firstWorkspaceName}" (order ${firstOrder}) should appear before "${secondWorkspaceName}" (order ${secondOrder})`);
    }
  }, BACKOFF_OPTIONS);
});

Then('workspace {string} should appear after workspace {string}', async function(this: ApplicationWorld, firstWorkspaceName: string, secondWorkspaceName: string) {
  await backOff(async () => {
    const [firstWorkspace, secondWorkspace] = await Promise.all([
      getWorkspaceByName(this, firstWorkspaceName),
      getWorkspaceByName(this, secondWorkspaceName),
    ]);

    const firstOrder = firstWorkspace.order ?? 0;
    const secondOrder = secondWorkspace.order ?? 0;

    if (firstOrder <= secondOrder) {
      throw new Error(`Workspace "${firstWorkspaceName}" (order ${firstOrder}) should appear after "${secondWorkspaceName}" (order ${secondOrder})`);
    }
  }, BACKOFF_OPTIONS);
});
