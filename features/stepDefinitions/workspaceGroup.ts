import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';

import type { IWorkspaceGroup } from '../../src/services/workspaces/interface';
// Pull in renderer window type declarations so Playwright page.evaluate callbacks
// can access window.service with proper typing.
import type {} from '../../src/preload/index';
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

interface IWorkspaceOrGroupOrderEntry {
  name: string;
  order: number;
  type: 'workspace' | 'group';
}

interface ITargetCoordinates {
  targetX: number;
  targetY: number;
}

interface IResolveTargetCoordinatesOptions {
  verifyElementAtPoint?: boolean;
}

type TResolveTargetCoordinates = (options?: IResolveTargetCoordinatesOptions) => Promise<ITargetCoordinates>;

function getSortableTargetSelector(targetId: string): string {
  return targetId.startsWith('group-')
    ? `[data-testid="workspace-group-${targetId.slice('group-'.length)}"]`
    : `[data-testid="workspace-item-${targetId}"]`;
}

function getDragIntentSelector(targetId: string, expectedIntent?: string): string {
  const targetSelector = getSortableTargetSelector(targetId);
  if (expectedIntent !== undefined) {
    return `${targetSelector}[data-drag-intent="${expectedIntent}"], ${targetSelector} [data-drag-intent="${expectedIntent}"]`;
  }
  return `${targetSelector}[data-drag-intent]:not([data-drag-intent="none"]), ${targetSelector} [data-drag-intent]:not([data-drag-intent="none"])`;
}

async function getAllWikiWorkspaces(world: ApplicationWorld): Promise<ITestWorkspace[]> {
  if (!world.currentWindow) {
    throw new Error('Current window not set');
  }
  return await world.currentWindow.evaluate(async () => {
    const all = await window.service.workspace.getWorkspacesAsList();
    return all.filter(workspace => !workspace.pageType) as ITestWorkspace[];
  });
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
  if (!world.currentWindow) {
    throw new Error('Current window not set');
  }
  return await world.currentWindow.evaluate(async () => window.service.workspace.getGroupsAsList());
}

async function getGroupWorkspaces(world: ApplicationWorld, groupId: string): Promise<ITestWorkspace[]> {
  const workspaces = await getAllWikiWorkspaces(world);
  return workspaces.filter(workspace => workspace.groupId === groupId);
}

async function getSidebarOrderEntries(world: ApplicationWorld): Promise<IWorkspaceOrGroupOrderEntry[]> {
  const [workspaces, groups] = await Promise.all([getAllWikiWorkspaces(world), getGroups(world)]);
  return [
    ...workspaces.filter(workspace => !workspace.groupId).map(workspace => ({
      name: workspace.name,
      order: workspace.order ?? 0,
      type: 'workspace' as const,
    })),
    ...groups.map(group => ({
      name: group.name,
      order: group.order ?? 0,
      type: 'group' as const,
    })),
  ].sort((left, right) => left.order - right.order);
}

async function createGroup(world: ApplicationWorld, groupName: string): Promise<IWorkspaceGroup> {
  const groups = await getGroups(world);
  const newGroup: IWorkspaceGroup = {
    id: `test-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: groupName,
    order: groups.length,
    collapsed: false,
  };

  if (!world.currentWindow) {
    throw new Error('Current window not set');
  }
  await world.currentWindow.evaluate(async (group: IWorkspaceGroup) => {
    await window.service.workspace.setGroup(group.id, group);
  }, newGroup);

  return newGroup;
}

async function moveWorkspaceToGroup(world: ApplicationWorld, workspaceId: string, groupId: string | null, autoDisband = true): Promise<void> {
  if (!world.currentWindow) {
    throw new Error('Current window not set');
  }
  await world.currentWindow.evaluate(async ({ workspaceId: id, groupId: gid, autoDisband: disband }: { workspaceId: string; groupId: string | null; autoDisband: boolean }) => {
    await window.service.workspace.moveWorkspaceToGroup(id, gid, disband);
  }, { workspaceId, groupId, autoDisband });
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

async function waitForGroupedWorkspaceDomState(world: ApplicationWorld, groupId: string, shouldBeVisible: boolean): Promise<void> {
  await backOff(async () => {
    if (!world.currentWindow) {
      throw new Error('Current window not set');
    }

    const groupedWorkspaces = await getGroupWorkspaces(world, groupId);

    for (const workspace of groupedWorkspaces) {
      const itemCount = await world.currentWindow.locator(`[data-testid="workspace-item-${workspace.id}"]`).count();
      const topDropZoneCount = await world.currentWindow.locator(`[data-testid="workspace-drop-zone-${workspace.id}-top"]`).count();

      if (shouldBeVisible && (itemCount === 0 || topDropZoneCount === 0)) {
        throw new Error(`Grouped workspace "${workspace.name}" is not fully visible yet`);
      }

      if (!shouldBeVisible && (itemCount !== 0 || topDropZoneCount !== 0)) {
        throw new Error(`Grouped workspace "${workspace.name}" is still visible`);
      }
    }
  }, BACKOFF_OPTIONS);
}

/**
 * Perform a pointer drag from `sourceSelector` to a target whose center is
 * resolved by `resolveTargetCoordinates`.  Waits for dnd-kit to acknowledge
 * the drag (DragOverlay appears) and, when `targetWorkspaceId` is provided,
 * for the target workspace to show the expected drag intent before dropping.
 *
 * When `expectedIntent` is provided the helper waits for that exact value
 * (e.g. 'reorder-before', 'group').  Otherwise it falls back to waiting for
 * any non-'none' intent.
 *
 * This replaces blind retry loops and fixed sleeps with condition-based
 * waits, making the drag deterministic regardless of machine speed.
 */
async function dragLocatorToCoordinates(
  world: ApplicationWorld,
  sourceSelector: string,
  resolveTargetCoordinates: TResolveTargetCoordinates,
  targetWorkspaceId?: string,
  expectedIntent?: string,
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

  // Position pointer at source center and start drag
  await world.currentWindow.mouse.move(startX, startY);
  await world.currentWindow.mouse.down();

  // Activate dnd-kit PointerSensor (activationConstraint distance: 8)
  await world.currentWindow.mouse.move(startX + 12, startY + 12, { steps: 10 });

  // Wait for dnd-kit to acknowledge the drag — the DragOverlay portal appears in the DOM
  await world.currentWindow.locator('[data-testid="dnd-drag-overlay"]').waitFor({ state: 'visible', timeout: 3000 });

  // Compute target center late, after drag activation, so coordinates reflect
  // the current layout.
  let { targetX, targetY } = await resolveTargetCoordinates();

  // Smooth movement to the target — the intermediate pointer positions
  // give dnd-kit enough update opportunities for collision detection.
  await world.currentWindow.mouse.move(targetX, targetY, { steps: 10 });

  ({ targetX, targetY } = await resolveCoordinatesAfterDragLayoutSettles(world, resolveTargetCoordinates, targetX, targetY));

  // Wait for dnd-kit collision detection to resolve on the target workspace.
  // When the pointer is over a recognized drop target the drag-intent
  // attribute changes from 'none' to the detected intent.  Waiting for the
  // exact expected value (not just non-none) ensures the intent has fully
  // settled before releasing — prevents the drop from firing while the
  // intent is still transitioning between zones.
  if (targetWorkspaceId !== undefined) {
    try {
      await world.currentWindow.locator(getDragIntentSelector(targetWorkspaceId, expectedIntent)).waitFor({ state: 'attached', timeout: 3000 });
    } catch (originalError) {
      // Collect diagnostic information before re-throwing, so failures
      // include the actual DOM state at the time of the timeout.
      const targetItemSelector = getSortableTargetSelector(targetWorkspaceId);
      let actualIntent = 'not-found';
      let targetRect: { x: number; y: number; width: number; height: number } | null = null;
      let sourceRect: { x: number; y: number; width: number; height: number } | null = null;
      let hasOverlay = false;
      let elementAtPoint = 'unknown';
      try {
        actualIntent = (await world.currentWindow.locator(getDragIntentSelector(targetWorkspaceId)).first().getAttribute('data-drag-intent')) ?? 'null-attribute';
      } catch { /* ignore */ }
      try {
        targetRect = await world.currentWindow.locator(targetItemSelector).boundingBox();
      } catch { /* ignore */ }
      try {
        sourceRect = await world.currentWindow.locator(sourceSelector).boundingBox();
      } catch { /* ignore */ }
      try {
        hasOverlay = (await world.currentWindow.locator('[data-testid="dnd-drag-overlay"]').count()) > 0;
      } catch { /* ignore */ }
      try {
        const elementTag = await world.currentWindow.evaluate(({ x, y }: { x: number; y: number }) => {
          const element = document.elementFromPoint(x, y);
          if (!element) return 'null';
          const testid = element.getAttribute('data-testid');
          const dragIntent = element.getAttribute('data-drag-intent');
          return `${element.tagName.toLowerCase()}${testid ? `[data-testid="${testid}"]` : ''}${dragIntent ? `[data-drag-intent="${dragIntent}"]` : ''}`;
        }, { x: targetX, y: targetY });
        elementAtPoint = elementTag ?? 'null';
      } catch { /* ignore */ }
      const yRatio = targetRect ? ((targetY - targetRect.y) / targetRect.height) : NaN;
      throw new Error(
        `Intent wait failed for ${targetWorkspaceId}. ` +
          `Expected: "${expectedIntent ?? 'any-non-none'}", actual: "${actualIntent}". ` +
          `Release coords: (${Math.round(targetX)}, ${Math.round(targetY)}). ` +
          `elementFromPoint: ${elementAtPoint}. ` +
          `Target rect: ${
            targetRect ? JSON.stringify({ x: Math.round(targetRect.x), y: Math.round(targetRect.y), w: Math.round(targetRect.width), h: Math.round(targetRect.height) }) : 'null'
          }. ` +
          `Y ratio into target: ${Number.isNaN(yRatio) ? 'N/A' : yRatio.toFixed(3)} ` +
          `(zone hint: ${
            expectedIntent === 'reorder-before' ? 'top 0.15' : expectedIntent === 'reorder-after' ? 'bottom 0.85' : expectedIntent === 'group' ? 'center 0.50' : 'unknown'
          }). ` +
          `Source rect: ${
            sourceRect ? JSON.stringify({ x: Math.round(sourceRect.x), y: Math.round(sourceRect.y), w: Math.round(sourceRect.width), h: Math.round(sourceRect.height) }) : 'null'
          }. ` +
          `DragOverlay visible: ${String(hasOverlay)}. ` +
          `Original error: ${originalError instanceof Error ? originalError.message : String(originalError)}`,
      );
    }
  }

  await world.currentWindow.mouse.up();
}

async function dragLocatorAndHoldAtCoordinates(
  world: ApplicationWorld,
  sourceSelector: string,
  resolveTargetCoordinates: TResolveTargetCoordinates,
  targetWorkspaceId?: string,
  expectedIntent?: string,
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
  await world.currentWindow.mouse.move(startX + 12, startY + 12, { steps: 10 });

  await world.currentWindow.locator('[data-testid="dnd-drag-overlay"]').waitFor({ state: 'visible', timeout: 3000 });

  let { targetX, targetY } = await resolveTargetCoordinates();
  await world.currentWindow.mouse.move(targetX, targetY, { steps: 10 });
  ({ targetX, targetY } = await resolveCoordinatesAfterDragLayoutSettles(world, resolveTargetCoordinates, targetX, targetY));

  if (targetWorkspaceId !== undefined) {
    try {
      await world.currentWindow.locator(getDragIntentSelector(targetWorkspaceId, expectedIntent)).waitFor({ state: 'attached', timeout: 3000 });
    } catch (originalError) {
      const targetItemSelector = getSortableTargetSelector(targetWorkspaceId);
      let actualIntent = 'not-found';
      let targetRect: { x: number; y: number; width: number; height: number } | null = null;
      try {
        actualIntent = (await world.currentWindow.locator(getDragIntentSelector(targetWorkspaceId)).first().getAttribute('data-drag-intent')) ?? 'null-attribute';
      } catch { /* ignore */ }
      try {
        targetRect = await world.currentWindow.locator(targetItemSelector).boundingBox();
      } catch { /* ignore */ }
      let elementAtPoint = 'unknown';
      try {
        const elementTag = await world.currentWindow.evaluate(({ x, y }: { x: number; y: number }) => {
          const element = document.elementFromPoint(x, y);
          if (!element) return 'null';
          const testid = element.getAttribute('data-testid');
          const dragIntent = element.getAttribute('data-drag-intent');
          return `${element.tagName.toLowerCase()}${testid ? `[data-testid="${testid}"]` : ''}${dragIntent ? `[data-drag-intent="${dragIntent}"]` : ''}`;
        }, { x: targetX, y: targetY });
        elementAtPoint = elementTag ?? 'null';
      } catch { /* ignore */ }
      const yRatio = targetRect ? ((targetY - targetRect.y) / targetRect.height) : NaN;
      throw new Error(
        `Intent wait failed for ${targetWorkspaceId} (hold-mode). ` +
          `Expected: "${expectedIntent ?? 'any-non-none'}", actual: "${actualIntent}". ` +
          `Hold coords: (${Math.round(targetX)}, ${Math.round(targetY)}). ` +
          `elementFromPoint: ${elementAtPoint}. ` +
          `Target rect: ${
            targetRect ? JSON.stringify({ x: Math.round(targetRect.x), y: Math.round(targetRect.y), w: Math.round(targetRect.width), h: Math.round(targetRect.height) }) : 'null'
          }. ` +
          `Y ratio into target: ${Number.isNaN(yRatio) ? 'N/A' : yRatio.toFixed(3)} ` +
          `(zone hint: ${
            expectedIntent === 'reorder-before' ? 'top 0.15' : expectedIntent === 'reorder-after' ? 'bottom 0.85' : expectedIntent === 'group' ? 'center 0.50' : 'unknown'
          }). ` +
          `Original error: ${originalError instanceof Error ? originalError.message : String(originalError)}`,
      );
    }
  }
}

async function resolveCoordinatesAfterDragLayoutSettles(
  world: ApplicationWorld,
  resolveTargetCoordinates: TResolveTargetCoordinates,
  currentTargetX: number,
  currentTargetY: number,
): Promise<ITargetCoordinates> {
  if (!world.currentWindow) {
    throw new Error('Current window not set');
  }

  let resolvedCoordinates = { targetX: currentTargetX, targetY: currentTargetY };

  for (let attempt = 0; attempt < 5; attempt++) {
    await world.currentWindow.evaluate(async () => {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            resolve();
          })
        )
      );
    });

    const settledCoordinates = await resolveTargetCoordinates({ verifyElementAtPoint: false });
    const deltaX = Math.abs(settledCoordinates.targetX - resolvedCoordinates.targetX);
    const deltaY = Math.abs(settledCoordinates.targetY - resolvedCoordinates.targetY);

    resolvedCoordinates = settledCoordinates;

    if (deltaX <= 1 && deltaY <= 1) {
      return resolvedCoordinates;
    }

    await world.currentWindow.mouse.move(resolvedCoordinates.targetX, resolvedCoordinates.targetY, { steps: 5 });
  }

  return resolvedCoordinates;
}

async function getLocatorCenter(
  world: ApplicationWorld,
  targetSelector: string,
): Promise<{ targetX: number; targetY: number }> {
  return getLocatorVerticalPoint(world, targetSelector, 0.5);
}

async function getLocatorVerticalPoint(
  world: ApplicationWorld,
  targetSelector: string,
  yRatio: number,
): Promise<{ targetX: number; targetY: number }> {
  if (!world.currentWindow) {
    throw new Error('Current window not set');
  }

  await world.currentWindow.locator(targetSelector).scrollIntoViewIfNeeded();

  for (let attempt = 0; attempt < 4; attempt++) {
    const rect = await world.currentWindow.evaluate((selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    }, targetSelector);

    if (rect) {
      return {
        targetX: rect.x + rect.width / 2,
        targetY: rect.y + rect.height * yRatio,
      };
    }

    if (attempt === 3) {
      const testIds = await world.currentWindow.evaluate(() => {
        const elements = document.querySelectorAll('[data-testid]');
        return Array.from(elements).map(element => element.getAttribute('data-testid')).filter(Boolean);
      });
      throw new Error(
        `Could not read bounding box for ${targetSelector}. Current DOM testids: ${testIds.join(', ')}`,
      );
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Could not read bounding box for ${targetSelector}`);
}

/**
 * Resolve deterministic drop-zone coordinates from the workspace item's own
 * bounding box.  The computation runs inside the browser page so that
 * getBoundingClientRect, elementFromPoint, and the eventual pointermove all
 * share the same layout frame — eliminating the timing gap where a layout
 * shift (e.g. dnd-kit scale transform on the target) could move the element
 * between the boundingBox read and mouse.move.
 *
 * Zones map to:
 *   top    — 15% from the top (well within the top-third BeforeDragging boundary)
 *   center — 50% (group-intent trigger zone)
 *   bottom — 85% from the top (well within the bottom-third AfterDragging boundary)
 */
async function getWorkspaceItemZoneCenter(
  world: ApplicationWorld,
  targetWorkspaceId: string,
  zone: 'top' | 'center' | 'bottom',
  options: IResolveTargetCoordinatesOptions = {},
): Promise<{ targetX: number; targetY: number }> {
  if (!world.currentWindow) {
    throw new Error('Current window not set');
  }

  const itemSelector = `[data-testid="workspace-item-${targetWorkspaceId}"]`;
  const itemLocator = world.currentWindow.locator(itemSelector);
  await itemLocator.waitFor({ state: 'visible' });
  await itemLocator.scrollIntoViewIfNeeded();

  const result = await world.currentWindow.evaluate(({ selector, zone: z }: { selector: string; zone: string }) => {
    const element = document.querySelector(selector);
    if (!element) {
      return { error: `Element not found: ${selector}` };
    }
    const rect = element.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2;
    let targetY: number;
    if (z === 'top') {
      targetY = rect.top + rect.height * 0.15;
    } else if (z === 'bottom') {
      targetY = rect.top + rect.height * 0.85;
    } else {
      targetY = rect.top + rect.height * 0.5;
    }

    // Verify the target item is actually at the computed point.
    // If the element has moved due to a layout shift (e.g. drag-intent
    // transform:scale), elementFromPoint will return a different element
    // and the test should fail fast instead of producing a misleading intent.
    // Skip verification for elements scrolled outside the viewport (CI has
    // smaller displays), because the drag itself will scroll during movement.
    const elementAtPoint = document.elementFromPoint(targetX, targetY);
    const isTargetAtPoint = elementAtPoint !== null && elementAtPoint.closest(selector) !== null;
    const isRectInViewport = rect.bottom >= 0 && rect.top <= window.innerHeight;

    return {
      targetX,
      targetY,
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      zone: z,
      ratio: rect.height > 0 ? (targetY - rect.top) / rect.height : 0,
      isTargetAtPoint,
      isRectInViewport,
      elementAtPointTag: elementAtPoint?.tagName?.toLowerCase() ?? 'null',
    };
  }, { selector: itemSelector, zone });

  if (!result || typeof result !== 'object') {
    throw new Error(`evaluate returned unexpected value for ${itemSelector}`);
  }
  if ('error' in result && typeof result.error === 'string') {
    throw new Error(result.error);
  }

  const { targetX, targetY, rect, ratio, isTargetAtPoint, isRectInViewport, elementAtPointTag } = result as {
    targetX: number;
    targetY: number;
    rect: { x: number; y: number; width: number; height: number };
    zone: string;
    ratio: number;
    isTargetAtPoint: boolean;
    isRectInViewport: boolean;
    elementAtPointTag: string;
  };

  // Diagnostic log for every zone resolution so flake investigations can
  // see exactly what coordinates were computed and whether the target was
  // present at that point before the mouse moved there.
  console.log(
    `[getWorkspaceItemZoneCenter] zone="${zone}" targetId="${targetWorkspaceId}" ` +
      `coords=(${Math.round(targetX)},${Math.round(targetY)}) ` +
      `rect={x:${Math.round(rect.x)},y:${Math.round(rect.y)},w:${Math.round(rect.width)},h:${Math.round(rect.height)}} ` +
      `ratio=${ratio.toFixed(3)} isTargetAtPoint=${String(isTargetAtPoint)} elementAtPoint=${elementAtPointTag}`,
  );

  if (options.verifyElementAtPoint !== false && !isTargetAtPoint && isRectInViewport) {
    throw new Error(
      `Coordinate verification failed for ${itemSelector} at zone "${zone}". ` +
        `Computed coords (${Math.round(targetX)}, ${Math.round(targetY)}) ` +
        `land on <${elementAtPointTag}> instead of the target element. ` +
        `Target rect: {x:${Math.round(rect.x)},y:${Math.round(rect.y)},w:${Math.round(rect.width)},h:${Math.round(rect.height)}}. ` +
        `This indicates a layout shift occurred during drag activation.`,
    );
  }

  if (!isTargetAtPoint && !isRectInViewport) {
    console.warn(
      `[getWorkspaceItemZoneCenter] Target ${itemSelector} is outside the viewport (rect y=${Math.round(rect.y)}, window height=${
        typeof window !== 'undefined' ? window.innerHeight : 'unknown'
      }). ` +
        `Proceeding with computed coordinates (${Math.round(targetX)}, ${Math.round(targetY)}) — drag movement may scroll it into view.`,
    );
  }

  return { targetX, targetY };
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
});

When('I drag workspace {string} onto workspace {string}', async function(this: ApplicationWorld, sourceWorkspaceName: string, targetWorkspaceName: string) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  const sourceWorkspace = await getWorkspaceByName(this, sourceWorkspaceName);
  const targetWorkspace = await getWorkspaceByName(this, targetWorkspaceName);
  // Sanity-check that the target workspace is fully rendered before dragging.
  const dropZoneSelector = `[data-testid="workspace-drop-zone-${targetWorkspace.id}-center"]`;
  await this.currentWindow.locator(dropZoneSelector).waitFor({ state: 'visible' });

  await dragLocatorToCoordinates(
    this,
    `[data-testid="workspace-item-${sourceWorkspace.id}"]`,
    async options => getWorkspaceItemZoneCenter(this, targetWorkspace.id, 'center', options),
    targetWorkspace.id,
    'group',
  );
});

When('I hover workspace {string} over workspace {string}', async function(this: ApplicationWorld, sourceWorkspaceName: string, targetWorkspaceName: string) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  const sourceWorkspace = await getWorkspaceByName(this, sourceWorkspaceName);
  const targetWorkspace = await getWorkspaceByName(this, targetWorkspaceName);
  // Sanity-check that the target workspace is fully rendered before dragging.
  const dropZoneSelector = `[data-testid="workspace-drop-zone-${targetWorkspace.id}-center"]`;
  await this.currentWindow.locator(dropZoneSelector).waitFor({ state: 'visible' });
  await dragLocatorAndHoldAtCoordinates(
    this,
    `[data-testid="workspace-item-${sourceWorkspace.id}"]`,
    async options => {
      return getWorkspaceItemZoneCenter(this, targetWorkspace.id, 'center', options);
    },
    targetWorkspace.id,
    'group',
  );
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
  // Sanity-check that the target workspace is fully rendered before dragging.
  const dropZoneSelector = `[data-testid="workspace-drop-zone-${targetWorkspace.id}-top"]`;
  await this.currentWindow.locator(dropZoneSelector).waitFor({ state: 'visible' });

  await dragLocatorToCoordinates(
    this,
    `[data-testid="workspace-item-${sourceWorkspace.id}"]`,
    async options => {
      return getWorkspaceItemZoneCenter(this, targetWorkspace.id, 'top', options);
    },
    targetWorkspace.id,
    'reorder-before',
  );
});

When('I drag workspace {string} to the bottom zone of workspace {string}', async function(this: ApplicationWorld, sourceWorkspaceName: string, targetWorkspaceName: string) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  const sourceWorkspace = await getWorkspaceByName(this, sourceWorkspaceName);
  const targetWorkspace = await getWorkspaceByName(this, targetWorkspaceName);
  // Sanity-check that the target workspace is fully rendered before dragging.
  const dropZoneSelector = `[data-testid="workspace-drop-zone-${targetWorkspace.id}-bottom"]`;
  await this.currentWindow.locator(dropZoneSelector).waitFor({ state: 'visible' });
  await dragLocatorToCoordinates(
    this,
    `[data-testid="workspace-item-${sourceWorkspace.id}"]`,
    async options => {
      return getWorkspaceItemZoneCenter(this, targetWorkspace.id, 'bottom', options);
    },
    targetWorkspace.id,
    'reorder-after',
  );
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
    async () => getLocatorCenter(this, groupHeaderSelector),
    `group-${workspace.groupId}`,
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

Then('there should be {int} workspace groups', async function(this: ApplicationWorld, expectedCount: number) {
  await backOff(async () => {
    const groups = await getGroups(this);
    if (groups.length !== expectedCount) {
      throw new Error(`Expected ${expectedCount} workspace groups, found ${groups.length}`);
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

When('I collapse workspace group {string}', async function(this: ApplicationWorld, groupName: string) {
  const groups = await getGroups(this);
  const group = groups.find(g => g.name === groupName);
  if (!group) {
    throw new Error(`Group "${groupName}" not found`);
  }

  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }
  await this.currentWindow.evaluate(async (g: IWorkspaceGroup) => {
    await window.service.workspace.setGroup(g.id, { ...g, collapsed: true });
  }, group);

  await waitForGroupedWorkspaceDomState(this, group.id, false);
});

When('I expand workspace group {string}', async function(this: ApplicationWorld, groupName: string) {
  const groups = await getGroups(this);
  const group = groups.find(g => g.name === groupName);
  if (!group) {
    throw new Error(`Group "${groupName}" not found`);
  }

  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }
  await this.currentWindow.evaluate(async (g: IWorkspaceGroup) => {
    await window.service.workspace.setGroup(g.id, { ...g, collapsed: false });
  }, group);

  await waitForGroupVisibility(this, group.id);
  await waitForGroupedWorkspaceDomState(this, group.id, true);
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

  await dragLocatorToCoordinates(
    this,
    sourceSelector,
    async () => {
      return await getLocatorVerticalPoint(this, targetSelector, 0.05);
    },
    `group-${targetGroup.id}`,
    'reorder-before',
  );
});

When('I drag group header {string} onto workspace {string}', async function(this: ApplicationWorld, sourceGroupName: string, targetWorkspaceName: string) {
  if (!this.currentWindow) {
    throw new Error('Current window not set');
  }

  const groups = await getGroups(this);
  const sourceGroup = groups.find(group => group.name === sourceGroupName);
  if (!sourceGroup) {
    throw new Error(`Source group "${sourceGroupName}" not found`);
  }

  const targetWorkspace = await getWorkspaceByName(this, targetWorkspaceName);
  const sourceSelector = `[data-testid="workspace-group-${sourceGroup.id}"]`;
  const targetSelector = `[data-testid="workspace-item-${targetWorkspace.id}"]`;
  const targetLocator = this.currentWindow.locator(targetSelector);
  await targetLocator.waitFor({ state: 'visible' });

  await dragLocatorToCoordinates(this, sourceSelector, async () => {
    return await getLocatorCenter(this, targetSelector);
  }, targetWorkspace.id);
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

Then('group {string} should appear before workspace {string}', async function(this: ApplicationWorld, groupName: string, workspaceName: string) {
  await backOff(async () => {
    const entries = await getSidebarOrderEntries(this);
    const groupEntry = entries.find(entry => entry.type === 'group' && entry.name === groupName);
    const workspaceEntry = entries.find(entry => entry.type === 'workspace' && entry.name === workspaceName);

    if (!groupEntry) {
      throw new Error(`Group "${groupName}" not found in sidebar entries: ${entries.map(entry => `${entry.type}:${entry.name}`).join(', ')}`);
    }
    if (!workspaceEntry) {
      throw new Error(`Workspace "${workspaceName}" not found in sidebar entries: ${entries.map(entry => `${entry.type}:${entry.name}`).join(', ')}`);
    }

    if (groupEntry.order >= workspaceEntry.order) {
      throw new Error(`Group "${groupName}" (order ${groupEntry.order}) should appear before workspace "${workspaceName}" (order ${workspaceEntry.order})`);
    }
  }, BACKOFF_OPTIONS);
});
