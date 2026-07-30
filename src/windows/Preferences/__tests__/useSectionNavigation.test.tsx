import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WindowNames } from '@services/windows/WindowProperties';
import { useSectionNavigation } from '../useSectionNavigation';

describe('useSectionNavigation', () => {
  beforeEach(() => {
    vi.mocked(window.remote.registerWindowMetaUpdated).mockReset();
    vi.mocked(window.remote.unregisterWindowMetaUpdated).mockReset();
  });

  afterEach(() => {
    vi.mocked(window.meta).mockReset();
  });

  it('keeps the newest request when an older navigation completes', () => {
    vi.mocked(window.meta).mockReturnValue({
      windowName: WindowNames.preferences,
      preferenceGotoTab: 'externalAPI',
    } as ReturnType<typeof window.meta>);

    const { result } = renderHook(() => useSectionNavigation(WindowNames.preferences));
    const initialRequest = result.current.navigationRequest;
    expect(initialRequest).toMatchObject({ behavior: 'auto', sectionId: 'externalAPI' });

    act(() => {
      result.current.navigateToSection('notifications');
    });
    const newestRequest = result.current.navigationRequest;
    expect(newestRequest?.requestId).toBeGreaterThan(initialRequest?.requestId ?? 0);

    act(() => {
      result.current.completeNavigation(initialRequest?.requestId ?? 0);
    });
    expect(result.current.navigationRequest?.sectionId).toBe('notifications');

    act(() => {
      result.current.completeNavigation(newestRequest?.requestId ?? 0);
    });
    expect(result.current.navigationRequest).toBeUndefined();
  });

  it('turns metadata pushed to an existing window into a new request', () => {
    vi.mocked(window.meta).mockReturnValue({ windowName: WindowNames.preferences });
    let metadataHandler: ((event: Electron.IpcRendererEvent, meta: ReturnType<typeof window.meta>) => void) | undefined;
    vi.mocked(window.remote.registerWindowMetaUpdated).mockImplementation((handler) => {
      metadataHandler = handler;
    });

    const { result } = renderHook(() => useSectionNavigation(WindowNames.preferences));
    expect(result.current.navigationRequest).toBeUndefined();

    act(() => {
      metadataHandler?.({} as Electron.IpcRendererEvent, {
        windowName: WindowNames.preferences,
        preferenceGotoTab: 'externalAPI',
      } as ReturnType<typeof window.meta>);
    });

    expect(result.current.navigationRequest).toMatchObject({
      behavior: 'auto',
      sectionId: 'externalAPI',
    });
  });
});
