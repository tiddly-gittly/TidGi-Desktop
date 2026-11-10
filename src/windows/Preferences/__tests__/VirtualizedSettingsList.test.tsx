import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VirtualizedSettingsList } from '../VirtualizedSettingsList';

class TestResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  disconnect = vi.fn();
  unobserve = vi.fn();

  observe = (target: Element) => {
    queueMicrotask(() => {
      const isRow = target.hasAttribute('data-react-window-index');
      this.callback(
        [{
          borderBoxSize: [{ blockSize: isRow ? 120 : 800, inlineSize: 550 }],
          contentRect: { height: isRow ? 120 : 800, width: 550 },
          target,
        } as unknown as ResizeObserverEntry],
        this,
      );
    });
  };
}

describe('VirtualizedSettingsList', () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalScrollTo = HTMLElement.prototype.scrollTo;
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    globalThis.ResizeObserver = TestResizeObserver;
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: function scrollTo(options: ScrollToOptions) {
        this.scrollTop = options.top ?? 0;
        this.dispatchEvent(new Event('scroll'));
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: originalScrollTo,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    });
  });

  it('jumps directly to a far unmounted section and settles it at the start', async () => {
    const entries = Array.from({ length: 200 }, (_, index) => ({
      estimatedHeight: 120,
      id: `section-${index}`,
    }));
    const onNavigationComplete = vi.fn();

    render(
      <VirtualizedSettingsList
        entries={entries}
        navigationRequest={{
          behavior: 'auto',
          requestId: 7,
          sectionId: 'section-150',
        }}
        onNavigationComplete={onNavigationComplete}
        renderEntry={(entry) => <div>{entry.id}</div>}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('section-150')).toBeInTheDocument();
      expect(onNavigationComplete).toHaveBeenCalledWith(7);
    });
    expect(document.querySelector('[data-settings-scroll-viewport]')).toBeInTheDocument();
    expect(screen.queryByText('section-20')).not.toBeInTheDocument();
  });

  it('uses the same owned scroll viewport when virtualization is disabled', async () => {
    const onNavigationComplete = vi.fn();
    render(
      <VirtualizedSettingsList
        entries={[{ id: 'external-api' }]}
        navigationRequest={{ behavior: 'auto', requestId: 9, sectionId: 'external-api' }}
        onNavigationComplete={onNavigationComplete}
        renderEntry={(entry) => <div>{entry.id}</div>}
        virtualize={false}
      />,
    );

    const entry = screen.getByText('external-api').closest('[data-settings-entry-id]');
    expect(entry?.closest('[data-settings-scroll-viewport]')).toBeInTheDocument();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(onNavigationComplete).toHaveBeenCalledWith(9);
    });
  });
});
