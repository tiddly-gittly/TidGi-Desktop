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

async function executeInMainWindow<T>(world: ApplicationWorld, pageFunction: (...arguments_: any[]) => any, argument?: any): Promise<T> {
  if (!world.currentWindow) {
    throw new Error('Current window not set');
  }
  return await world.currentWindow.evaluate(pageFunction, argument);
}

async function getAllWikiWorkspaces(world: ApplicationWorld): Promise<ITestWorkspace[]> {
  return await executeInMainWindow<ITestWorkspace[]>(
    world,
    async () => {
      const all = await window.service.workspace.getWorkspacesAsList();
      return all.filter(workspace => !workspace.pageType) as ITestWorkspace[];
    },
    undefined,
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
    async () => window.service.workspace.getGroupsAsList(),
    undefined,
  );
}

async function getGroupById(world: ApplicationWorld, groupId: string): Promise<IWorkspaceGroup | undefined> {
  return await executeInMainWindow<IWorkspaceGroup | undefined>(
    world,
    async (id) => window.service.workspace.getGroup(id),
    groupId,
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
    async (group: IWorkspaceGroup) => {
      await window.service.workspace.setGroup(group.id, group);
    },
    newGroup,
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

async function moveWorkspaceToGroup(world: ApplicationWorld, workspaceId: string, groupId: string | null, autoDisband = true): Promise<void> {
  await executeInMainWindow<unknown>(
    world,
    async ({ workspaceId: id, groupId: gid, autoDisband: disband }: { workspaceId: string; groupId: string | null; autoDisband: boolean }) => {
      await window.service.workspace.moveWorkspaceToGroup(id, gid, disband);
    },
    { workspaceId, groupId, autoDisband },
  );
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
  scrollTargetSelector?: string,
): Promise<void> {
  if (!world.currentWindow) {
    throw new Error('Current window not set');
  }

  // Capture renderer-side errors (e.g. React crashes) that would otherwise be silent.
  // React errors caught by ErrorBoundary go to console.error, not pageerror.
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const onPageError = (error: Error) => {
    pageErrors.push(error.message);
    console.error('[Renderer pageerror]', error.message);
  };
  const onConsole = (message: import('playwright').ConsoleMessage) => {
    if (message.type() === 'error') {
      const text = message.text();
      consoleErrors.push(text);
      console.error('[Renderer console.error]', text);
    }
  };
  world.currentWindow.on('pageerror', onPageError);
  world.currentWindow.on('console', onConsole);

  const sourceLocator = world.currentWindow.locator(sourceSelector);
  await sourceLocator.waitFor({ state: 'visible' });
  await sourceLocator.scrollIntoViewIfNeeded();

  const sourceBox = await sourceLocator.boundingBox();
  if (!sourceBox) {
    throw new Error(`Could not read bounding box for ${sourceSelector}`);
  }

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;

  // Pre-compute target coordinates before starting the drag.
  // Once dnd-kit activates, CSS transitions on SortableGroupHeader can make
  // Playwright's boundingBox() stall until they settle (or time out).
  const initialTargetCoordinates = await resolveTargetCoordinates();

  await world.currentWindow.mouse.move(startX, startY);
  await world.currentWindow.mouse.down();
  // Small initial movement to satisfy dnd-kit PointerSensor activationConstraint (distance: 8)
  await world.currentWindow.mouse.move(startX + 12, startY + 12, { steps: 6 });
  // Wait for dnd-kit to start the drag and for SortableContext to shift items
  await world.currentWindow.waitForTimeout(200);

  if (scrollTargetSelector) {
    // Use synthetic pointer events to teleport the drag directly onto the target.
    // This avoids coordinate drift that occurs with Playwright's mouse.move() over long distances.
    await world.currentWindow.mouse.move(startX, startY);
    await world.currentWindow.mouse.down();
    await world.currentWindow.mouse.move(startX + 12, startY + 12, { steps: 6 });
    await world.currentWindow.waitForTimeout(200);

    const targetBox = await world.currentWindow.evaluate((selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, scrollTargetSelector);

    if (!targetBox) {
      throw new Error(`Could not find target element ${scrollTargetSelector} for synthetic drag`);
    }

    // Dispatch pointermove directly at the target center to update dnd-kit's drag position
    await world.currentWindow.evaluate(({ x, y }: { x: number; y: number }) => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: x,
          clientY: y,
        }),
      );
    }, targetBox);

    await world.currentWindow.waitForTimeout(400);
    await world.currentWindow.mouse.up();
    return;
  }

  // Move to target with a smooth path, then re-track once in case the target shifted
  await world.currentWindow.mouse.move(initialTargetCoordinates.targetX, initialTargetCoordinates.targetY, { steps: 12 });
  await world.currentWindow.waitForTimeout(200);
  const settledTargetCoordinates = await resolveTargetCoordinates();
  await world.currentWindow.mouse.move(settledTargetCoordinates.targetX, settledTargetCoordinates.targetY, { steps: 5 });
  await world.currentWindow.waitForTimeout(600);
  // Final live re-track: read the target's current position and teleport the
  // mouse there immediately. This compensates for CSS transitions applied by
  // dnd-kit's SortableContext which can shift the target after we last
  // measured it.
  const liveTargetCoordinates = await resolveTargetCoordinates();
  await world.currentWindow.mouse.move(liveTargetCoordinates.targetX, liveTargetCoordinates.targetY, { steps: 1 });
  // Dispatch a synthetic pointermove at the live target coordinates.
  // dnd-kit reads clientX/clientY from pointer events; Playwright's discrete
  // mouse.move steps can leave the internal pointer position behind if the
  // target element has shifted due to SortableContext layout changes.
  await world.currentWindow.evaluate(({ x, y }: { x: number; y: number }) => {
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: x,
        clientY: y,
      }),
    );
  }, { x: liveTargetCoordinates.targetX, y: liveTargetCoordinates.targetY });
  await world.currentWindow.waitForTimeout(100);
  await world.currentWindow.mouse.up();

  world.currentWindow.off('pageerror', onPageError);
  world.currentWindow.off('console', onConsole);
  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    throw new Error(
      `Renderer crashed during drag with ${pageErrors.length} page error(s) and ${consoleErrors.length} console error(s): ` +
        [...pageErrors, ...consoleErrors].join('; '),
    );
  }
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
  await sourceLocator.scrollIntoViewIfNeeded();

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
  world: ApplicationWorld,
  targetSelector: string,
  _locator: { boundingBox: () => Promise<{ x: number; y: number; width: number; height: number } | null> },
): Promise<{ targetX: number; targetY: number }> {
  // Use Playwright locator.evaluate with retries.
  // React may still be re-rendering after group creation, so the element can
  // appear slightly after the parent workspace item.
  if (!world.currentWindow) {
    throw new Error('Current window not set');
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const rect = await world.currentWindow.locator(targetSelector).evaluate(
        (element: Element) => {
          const r = element.getBoundingClientRect();
          return { x: r.left, y: r.top, width: r.width, height: r.height };
        },
        undefined,
        { timeout: 1500 },
      );
      return {
        targetX: rect.x + rect.width / 2,
        targetY: rect.y + rect.height / 2,
      };
    } catch {
      if (attempt === 5) {
        // Diagnostic: list all workspace/group testids currently in the DOM
        const testIds = await world.currentWindow.evaluate(() => {
          const elements = document.querySelectorAll('[data-testid]');
          return Array.from(elements).map(element => element.getAttribute('data-testid')).filter(Boolean);
        });
        throw new Error(
          `Could not read bounding box for ${targetSelector}. Current DOM testids: ${testIds.join(', ')}`,
        );
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  throw new Error(`Could not read bounding box for ${targetSelector}`);
}

Given('workspace group {string} contains workspaces:', async function(this: ApplicationWorld, groupName: string, dataTable: DataTable) {
  const rows = dataTable.raw().map(([workspaceName]: string[]) => workspaceName).filter((workspaceName): workspaceName is string => Boolean(workspaceName));
  const group = await createGroup(this, groupName);

  for (const workspaceName of rows) {
    const workspace = await getWorkspaceByName(this, workspaceName);
    await moveWorkspaceToGroup(this, workspace.id, group.id);
    await waitForWorkspaceGroupId(this, workspaceName, group.id);
  }

  await waitForGroupVisibility(this, group.id);

  // Wait for every workspace in the group to actually appear in the DOM
  // so that subsequent drag steps can locate their drop zones.
  for (const workspaceName of rows) {
    const workspace = await getWorkspaceByName(this, workspaceName);
    await backOff(async () => {
      if (!this.currentWindow) {
        throw new Error('Current window not set');
      }
      const itemCount = await this.currentWindow.locator(`[data-testid="workspace-item-${workspace.id}"]`).count();
      if (itemCount === 0) {
        throw new Error(`Workspace item "${workspaceName}" not yet rendered in DOM`);
      }
      const dropZoneCount = await this.currentWindow.locator(`[data-testid="workspace-drop-zone-${workspace.id}-top"]`).count();
      if (dropZoneCount === 0) {
        throw new Error(`Workspace drop zone "${workspaceName}" not yet rendered in DOM`);
      }
    }, BACKOFF_OPTIONS);
  }

  // Allow any deferred async side-effects (e.g. tidgi.config.json writes)
  // to finish so that React state stabilises before the drag step starts.
  await this.currentWindow?.waitForTimeout(3000);
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

  await dragLocatorToCoordinates(
    this,
    `[data-testid="workspace-item-${sourceWorkspace.id}"]`,
    async () => getLocatorCenter(this, targetSelector, targetLocator),
  );
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
    return getLocatorCenter(this, targetSelector, targetLocator);
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
    return getLocatorCenter(this, targetSelector, targetLocator);
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
    return getLocatorCenter(this, targetSelector, targetLocator);
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

  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }
  const targetLocator = this.currentWindow.locator(groupHeaderSelector);
  await targetLocator.waitFor({ state: 'visible' });

  await dragLocatorToCoordinates(
    this,
    sourceSelector,
    async () => getLocatorCenter(this, groupHeaderSelector, targetLocator),
  );
});

When('I remove workspace {string} from its group without auto-disband', async function(this: ApplicationWorld, workspaceName: string) {
  const workspace = await getWorkspaceByName(this, workspaceName);
  if (!workspace.groupId) {
    throw new Error(`Workspace "${workspaceName}" is not currently grouped`);
  }

  await moveWorkspaceToGroup(this, workspace.id, null, false);
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
    async (g: IWorkspaceGroup) => {
      await window.service.workspace.setGroup(g.id, { ...g, collapsed: true });
    },
    group,
  );

  // Wait for Collapse unmountOnExit to fully remove children from DOM
  await this.currentWindow?.waitForTimeout(400);
});

When('I expand workspace group {string}', async function(this: ApplicationWorld, groupName: string) {
  const groups = await getGroups(this);
  const group = groups.find(g => g.name === groupName);
  if (!group) {
    throw new Error(`Group "${groupName}" not found`);
  }

  await executeInMainWindow<unknown>(
    this,
    async (g: IWorkspaceGroup) => {
      await window.service.workspace.setGroup(g.id, { ...g, collapsed: false });
    },
    group,
  );

  // Wait for the MUI Collapse animation to finish so that
  // overflow:hidden no longer clips pointer events on child elements.
  // timeout='auto' can take 300-500ms for small lists; 2000ms ensures completion
  // even on slower CI runners.
  await this.currentWindow?.waitForTimeout(2000);
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
    return getLocatorCenter(this, targetSelector, targetLocator);
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
