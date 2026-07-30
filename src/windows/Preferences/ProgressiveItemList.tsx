import React, { useEffect, useRef, useState } from 'react';

interface IProgressiveItemListProps<TItem> {
  batchSize?: number;
  items: TItem[];
  renderAll?: boolean;
  renderItem: (item: TItem, index: number) => React.ReactNode;
}

/**
 * Keeps very large sections cheap without introducing a nested scroll area.
 * More settings are appended only when the sentinel approaches the viewport;
 * the outer variable-height virtual list remeasures the section automatically.
 */
export function ProgressiveItemList<TItem>({
  items,
  renderItem,
  batchSize = 20,
  renderAll = false,
}: IProgressiveItemListProps<TItem>): React.JSX.Element {
  const [visibleCount, setVisibleCount] = useState(() => renderAll ? items.length : Math.min(batchSize, items.length));
  const sentinelReference = useRef<HTMLLIElement>(null);

  useEffect(() => {
    setVisibleCount((current) => renderAll ? items.length : Math.min(Math.max(current, batchSize), items.length));
  }, [batchSize, items.length, renderAll]);

  useEffect(() => {
    if (renderAll || visibleCount >= items.length) return;
    const sentinel = sentinelReference.current;
    if (!sentinel) return;

    if (typeof IntersectionObserver === 'undefined') {
      const idleCallback = requestIdleCallback(() => {
        setVisibleCount((current) => Math.min(current + batchSize, items.length));
      }, { timeout: 500 });
      return () => {
        cancelIdleCallback(idleCallback);
      };
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some(({ isIntersecting }) => isIntersecting)) {
        setVisibleCount((current) => Math.min(current + batchSize, items.length));
      }
    }, { rootMargin: '600px 0px' });
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [batchSize, items.length, renderAll, visibleCount]);

  return (
    <>
      {items.slice(0, visibleCount).map(renderItem)}
      {visibleCount < items.length && <li ref={sentinelReference} aria-hidden style={{ height: 1, listStyle: 'none' }} />}
    </>
  );
}
