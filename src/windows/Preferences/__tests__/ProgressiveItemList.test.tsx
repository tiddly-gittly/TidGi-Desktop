import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProgressiveItemList } from '../ProgressiveItemList';

describe('ProgressiveItemList', () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver;

  afterEach(() => {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  });

  it('renders large sections in viewport-driven batches', async () => {
    let notifyIntersection: IntersectionObserverCallback | undefined;
    class TestIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        notifyIntersection = callback;
      }

      disconnect = vi.fn();
      observe = vi.fn();
      takeRecords = vi.fn(() => []);
      unobserve = vi.fn();
      root = null;
      rootMargin = '';
      thresholds = [];
    }
    globalThis.IntersectionObserver = TestIntersectionObserver as unknown as typeof IntersectionObserver;

    const items = Array.from({ length: 100 }, (_, index) => index);
    render(
      <ProgressiveItemList
        items={items}
        batchSize={20}
        renderItem={(item) => {
          return <div key={item}>setting-{item}</div>;
        }}
      />,
    );

    expect(screen.getByText('setting-19')).toBeInTheDocument();
    expect(screen.queryByText('setting-20')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(notifyIntersection).toBeDefined();
    });

    act(() => {
      notifyIntersection?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(screen.getByText('setting-39')).toBeInTheDocument();
    expect(screen.queryByText('setting-40')).not.toBeInTheDocument();
  });
});
