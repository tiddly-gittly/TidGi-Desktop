import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: unknown) => template),
  deferredChecked: vi.fn(async () => true),
  setApplicationMenu: vi.fn(),
}));

vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: mocks.buildFromTemplate,
    setApplicationMenu: mocks.setApplicationMenu,
  },
  MenuItem: class {
    public readonly isMockMenuItem = true;
  },
  app: { getPath: vi.fn(() => process.cwd()) },
  clipboard: {},
  ipcRenderer: { on: vi.fn(), removeListener: vi.fn() },
  nativeImage: {},
  net: { fetch: vi.fn() },
  shell: { openExternal: vi.fn() },
}));

vi.mock('../loadDefaultMenuTemplate', () => ({
  loadDefaultMenuTemplate: () => [{
    id: 'TidGi',
    label: 'TidGi',
    submenu: [{
      checked: mocks.deferredChecked,
      id: 'database-backed-item',
      label: 'Database-backed item',
      type: 'checkbox',
    }],
  }],
}));

vi.mock('../contextMenu/contextMenuBuilder', () => ({
  default: class {
    public readonly isMockContextMenuBuilder = true;
  },
}));

vi.mock('../contextMenu/rendererMenuItemProxy', () => ({
  mainMenuItemProxy: vi.fn((items: unknown) => items),
}));

import { DEFERRED_MENU_PROPERTY_TIMEOUT_MS } from '@/constants/parameters';
import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isIpcSafeMenuItems, MenuService } from '..';

const createMenuService = (): MenuService =>
  new MenuService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

describe('MenuService application lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.deferredChecked.mockResolvedValue(true);
  });

  it('does not evaluate database-backed menu state before application initialization', async () => {
    const menuService = createMenuService();

    await menuService.buildMenu();
    await vi.runAllTimersAsync();

    expect(mocks.deferredChecked).not.toHaveBeenCalled();
    expect(mocks.buildFromTemplate).not.toHaveBeenCalled();

    await menuService.initializeForApp();

    expect(mocks.deferredChecked).toHaveBeenCalledTimes(1);
    expect(mocks.buildFromTemplate).toHaveBeenCalledTimes(1);
    expect(mocks.setApplicationMenu).toHaveBeenCalledTimes(1);
  });

  it('coalesces early build requests into the first ready menu build', async () => {
    const menuService = createMenuService();

    await Promise.all([
      menuService.buildMenu(),
      menuService.buildMenu(),
      menuService.buildMenu(),
    ]);
    await vi.runAllTimersAsync();

    await menuService.initializeForApp();

    expect(mocks.deferredChecked).toHaveBeenCalledTimes(1);
    expect(mocks.buildFromTemplate).toHaveBeenCalledTimes(1);
  });

  it('settles startup menu initialization when a deferred provider never settles', async () => {
    mocks.deferredChecked.mockImplementation(() => new Promise<boolean>(() => undefined));
    const menuService = createMenuService();

    const initialization = menuService.initializeForApp();
    await vi.advanceTimersByTimeAsync(DEFERRED_MENU_PROPERTY_TIMEOUT_MS);
    await expect(initialization).resolves.toBeUndefined();

    const template = mocks.buildFromTemplate.mock.calls[0][0] as Array<{ submenu: Array<{ checked: boolean }> }>;
    expect(template[0].submenu[0].checked).toBe(false);
    expect(mocks.setApplicationMenu).toHaveBeenCalledTimes(1);
  });

  it('isolates a rejected deferred provider and can rebuild successfully later', async () => {
    mocks.deferredChecked.mockRejectedValueOnce(new Error('old settings unavailable'));
    const menuService = createMenuService();

    await expect(menuService.initializeForApp()).resolves.toBeUndefined();
    let template = mocks.buildFromTemplate.mock.calls[0][0] as Array<{ submenu: Array<{ checked: boolean }> }>;
    expect(template[0].submenu[0].checked).toBe(false);

    await menuService.buildMenu();
    await vi.runAllTimersAsync();
    template = mocks.buildFromTemplate.mock.calls[1][0] as Array<{ submenu: Array<{ checked: boolean }> }>;
    expect(template[0].submenu[0].checked).toBe(true);
  });

  it('rejects malformed renderer menu entries before reconstructing callbacks', () => {
    expect(isIpcSafeMenuItems([{ click: 'safe', submenu: [{ click: 'nested' }] }])).toBe(true);
    expect(isIpcSafeMenuItems([{ click: 'safe', submenu: [{ click: 42 }] }])).toBe(false);
    expect(isIpcSafeMenuItems([{ click: 'safe' }, { label: 'missing callback' }])).toBe(false);
  });

  it('uses the attached workspace ID when Chromium lowercases its host', async () => {
    const menu = createMenuService();
    vi.spyOn(menu, 'buildContextMenuAndPopup').mockResolvedValue(undefined);
    const lookup = vi.spyOn(container.get<IWorkspaceService>(serviceIdentifier.Workspace), 'get').mockResolvedValue(undefined);
    const contents = { on: vi.fn(), getURL: vi.fn(() => 'tidgi://example-wiki/Index') };
    await menu.initContextMenuForWindowWebContents(contents as never, 'Example-Wiki');
    const handle = contents.on.mock.calls[0][1] as (event: object, parameters: object) => Promise<void>;
    await handle({}, {});
    expect(lookup).toHaveBeenCalledExactlyOnceWith('Example-Wiki');
    contents.getURL.mockReturnValue('tidgi://different-wiki/Index');
    await handle({}, {});
    expect(lookup).toHaveBeenCalledTimes(1);
    lookup.mockRestore();
  });
});
