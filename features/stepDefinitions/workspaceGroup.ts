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
  resolveTargetCoordinates: () => Promise<{ targetX: number; targetY: number }>,
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
  const initialTargetCoordinates = await resolveTargetCoordinates();
  await world.currentWindow.mouse.move(initialTargetCoordinates.targetX, initialTargetCoordinates.targetY, { steps: 20 });
  await world.currentWindow.waitForTimeout(40);
  const settledTargetCoordinates = await resolveTargetCoordinates();
  await world.currentWindow.mouse.move(settledTargetCoordinates.targetX, settledTargetCoordinates.targetY, { steps: 10 });
  await world.currentWindow.waitForTimeout(80);
  await world.currentWindow.mouse.up();
}

async function dragLocatorAndHoldAtCoordinates(
  world: ApplicationWorld,
  sourceSelector: string,
  resolveTargetCoordinates: () => Promise<{ targetX: number; targetY: number }>,
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
  const initialTargetCoordinates = await resolveTargetCoordinates();
  await world.currentWindow.mouse.move(initialTargetCoordinates.targetX, initialTargetCoordinates.targetY, { steps: 20 });
  await world.currentWindow.waitForTimeout(40);
  const settledTargetCoordinates = await resolveTargetCoordinates();
  await world.currentWindow.mouse.move(settledTargetCoordinates.targetX, settledTargetCoordinates.targetY, { steps: 10 });
  await world.currentWindow.waitForTimeout(80);
}

async function getLocatorCenter(
  targetSelector: string,
  locator: { boundingBox: () => Promise<{ x: number; y: number; width: number; height: number } | null> },
): Promise<{ targetX: number; targetY: number }> {
  const targetBox = await locator.boundingBox();
  if (!targetBox) {
    throw new Error(`Could not read bounding box for ${targetSelector}`);
  }

  return {
    targetX: targetBox.x + targetBox.width / 2,
    targetY: targetBox.y + targetBox.height / 2,
  };
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
  const targetSelector = `[data-testid="workspace-drop-zone-${targetWorkspace.id}-center"]`;
  const targetLocator = this.currentWindow.locator(targetSelector);
  await targetLocator.waitFor({ state: 'visible' });
  await dragLocatorToCoordinates(this, `[data-testid="workspace-item-${sourceWorkspace.id}"]`, async () => {
    return getLocatorCenter(targetSelector, targetLocator);
  });
});

When('I hover workspace {string} over workspace {string}', async function(this: ApplicationWorld, sourceWorkspaceName: string, targetWorkspaceName: string) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  const sourceWorkspace = await getWorkspaceByName(this, sourceWorkspaceName);
  const targetWorkspace = await getWorkspaceByName(this, targetWorkspaceName);
  const targetSelector = `[data-testid="workspace-drop-zone-${targetWorkspace.id}-center"]`;
  const targetLocator = this.currentWindow.locator(targetSelector);
  await targetLocator.waitFor({ state: 'visible' });
  await dragLocatorAndHoldAtCoordinates(this, `[data-testid="workspace-item-${sourceWorkspace.id}"]`, async () => {
    return getLocatorCenter(targetSelector, targetLocator);
  });
});

When('I release the mouse', async function(this: ApplicationWorld) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  await this.currentWindow.mouse.up();
});

When('I drag workspace {string} to the top zone of workspace {string}', async function(this: ApplicationWorld, sourceWorkspaceName: string, targetWorkspaceName: string) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  const sourceWorkspace = await getWorkspaceByName(this, sourceWorkspaceName);
  const targetWorkspace = await getWorkspaceByName(this, targetWorkspaceName);
  const targetSelector = `[data-testid="workspace-drop-zone-${targetWorkspace.id}-top"]`;
  const targetLocator = this.currentWindow.locator(targetSelector);
  await targetLocator.waitFor({ state: 'visible' });
  await dragLocatorToCoordinates(this, `[data-testid="workspace-item-${sourceWorkspace.id}"]`, async () => {
    return getLocatorCenter(targetSelector, targetLocator);
  });
});

When('I drag workspace {string} to the bottom zone of workspace {string}', async function(this: ApplicationWorld, sourceWorkspaceName: string, targetWorkspaceName: string) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  const sourceWorkspace = await getWorkspaceByName(this, sourceWorkspaceName);
  const targetWorkspace = await getWorkspaceByName(this, targetWorkspaceName);
  const targetSelector = `[data-testid="workspace-drop-zone-${targetWorkspace.id}-bottom"]`;
  const targetLocator = this.currentWindow.locator(targetSelector);
  await targetLocator.waitFor({ state: 'visible' });
  await dragLocatorToCoordinates(this, `[data-testid="workspace-item-${sourceWorkspace.id}"]`, async () => {
    return getLocatorCenter(targetSelector, targetLocator);
  });
});

When('I drag workspace {string} onto the header of its current group', async function(this: ApplicationWorld, workspaceName: string) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  const workspace = await getWorkspaceByName(this, workspaceName);
  if (!workspace.groupId) {
    throw new Error(`Workspace "${workspaceName}" is not currently grouped`);
  }

  const sourceSelector = `[data-testid="workspace-item-${workspace.id}"]`;
  const groupHeaderSelector = `[data-testid="workspace-group-${workspace.groupId}"]`;
  const sourceLocator = this.currentWindow.locator(sourceSelector);
  const groupHeaderLocator = this.currentWindow.locator(groupHeaderSelector);
  await sourceLocator.waitFor({ state: 'visible' });
  await groupHeaderLocator.waitFor({ state: 'visible' });

  const sourceBox = await sourceLocator.boundingBox();
  if (!sourceBox) {
    throw new Error(`Could not read bounding box for ${sourceSelector}`);
  }

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  await this.currentWindow.mouse.move(startX, startY);
  await this.currentWindow.mouse.down();
  await this.currentWindow.mouse.move(startX + 12, startY + 12, { steps: 6 });

  const liveTargetCoordinates = await this.currentWindow.evaluate((selector: string) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    return {
      targetX: rect.x + rect.width / 2,
      targetY: rect.y + rect.height / 2,
      rectTop: rect.top,
      rectBottom: rect.bottom,
      rectLeft: rect.left,
      rectRight: rect.right,
    };
  }, groupHeaderSelector);

  if (!liveTargetCoordinates) {
    throw new Error(`Could not read bounding box for ${groupHeaderSelector}`);
  }

  // Teleport directly to the target to avoid intermediate mousemove events
  // that can trigger React re-renders and shift the DOM before we arrive.
  await this.currentWindow.mouse.move(liveTargetCoordinates.targetX, liveTargetCoordinates.targetY);
  await this.currentWindow.waitForTimeout(100);
  await this.currentWindow.mouse.up();
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

Then('workspace {string} should show {string} drag intent', async function(this: ApplicationWorld, workspaceName: string, expectedIntent: string) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  await backOff(async () => {
    const workspace = await getWorkspaceByName(this, workspaceName);
    const selector = `[data-testid="workspace-item-${workspace.id}"] [data-drag-intent]`;
    const actualIntent = await this.currentWindow?.locator(selector).getAttribute('data-drag-intent');

    if (actualIntent !== expectedIntent) {
      throw new Error(`Workspace "${workspaceName}" drag intent is ${String(actualIntent)}, expected ${expectedIntent}`);
    }
  }, BACKOFF_OPTIONS);
});

When('I press the Escape key', async function(this: ApplicationWorld) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  await this.currentWindow.keyboard.press('Escape');
  await this.currentWindow.waitForTimeout(100);
});

When('I collapse workspace group {string}', async function(this: ApplicationWorld, groupName: string) {
  const groups = await getGroups(this);
  const group = groups.find(g => g.name === groupName);
  if (!group) {
    throw new Error(`Group "${groupName}" not found`);
  }

  await executeInMainWindow<unknown>(
    this,
    `
    window.service.workspace.setGroup(${JSON.stringify(group.id)}, { ...${JSON.stringify(group)}, collapsed: true })
  `,
  );

  await this.currentWindow?.waitForTimeout(200);
});

When('I expand workspace group {string}', async function(this: ApplicationWorld, groupName: string) {
  const groups = await getGroups(this);
  const group = groups.find(g => g.name === groupName);
  if (!group) {
    throw new Error(`Group "${groupName}" not found`);
  }

  await executeInMainWindow<unknown>(
    this,
    `
    window.service.workspace.setGroup(${JSON.stringify(group.id)}, { ...${JSON.stringify(group)}, collapsed: false })
  `,
  );

  await this.currentWindow?.waitForTimeout(200);
});

When('I drag group header {string} onto group header {string}', async function(this: ApplicationWorld, sourceGroupName: string, targetGroupName: string) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  const groups = await getGroups(this);
  const sourceGroup = groups.find(g => g.name === sourceGroupName);
  const targetGroup = groups.find(g => g.name === targetGroupName);

  if (!sourceGroup) {
    throw new Error(`Source group "${sourceGroupName}" not found`);
  }
  if (!targetGroup) {
    throw new Error(`Target group "${targetGroupName}" not found`);
  }

  const sourceSelector = `[data-testid="workspace-group-${sourceGroup.id}"]`;
  const targetSelector = `[data-testid="workspace-group-${targetGroup.id}"]`;
  const targetLocator = this.currentWindow.locator(targetSelector);
  await targetLocator.waitFor({ state: 'visible' });

  await dragLocatorToCoordinates(this, sourceSelector, async () => {
    return getLocatorCenter(targetSelector, targetLocator);
  });
});

Then('group {string} should appear before group {string}', async function(this: ApplicationWorld, firstGroupName: string, secondGroupName: string) {
  await backOff(async () => {
    const groups = await getGroups(this);
    const firstGroup = groups.find(g => g.name === firstGroupName);
    const secondGroup = groups.find(g => g.name === secondGroupName);

    if (!firstGroup) {
      throw new Error(`Group "${firstGroupName}" not found`);
    }
    if (!secondGroup) {
      throw new Error(`Group "${secondGroupName}" not found`);
    }

    const firstOrder = firstGroup.order ?? 0;
    const secondOrder = secondGroup.order ?? 0;

    if (firstOrder >= secondOrder) {
      throw new Error(`Group "${firstGroupName}" (order ${firstOrder}) should appear before "${secondGroupName}" (order ${secondOrder})`);
    }
  }, BACKOFF_OPTIONS);
});
