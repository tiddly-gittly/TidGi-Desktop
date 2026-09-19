import { styled } from '@mui/material/styles';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { List, useDynamicRowHeight, useListCallbackRef } from 'react-window';

import type { ISectionNavigationRequest } from './useSectionNavigation';

export interface IVirtualizedSettingsEntry {
  estimatedHeight?: number;
  id: string;
}

interface IRowProps<TEntry extends IVirtualizedSettingsEntry> {
  entries: TEntry[];
  renderEntry: (entry: TEntry) => React.ReactNode;
}

interface IVirtualizedSettingsListProps<TEntry extends IVirtualizedSettingsEntry> {
  defaultRowHeight?: number;
  entries: TEntry[];
  navigationRequest?: ISectionNavigationRequest;
  onNavigationComplete?: (requestId: number) => void;
  renderEntry: (entry: TEntry) => React.ReactNode;
  virtualize?: boolean;
}

const Viewport = styled('div')`
  height: calc(100vh - 96px);
  min-height: 240px;
  width: 100%;
`;

const FallbackViewport = styled(Viewport)`
  overflow-y: auto;
`;

function SettingsRow<TEntry extends IVirtualizedSettingsEntry>({
  entries,
  index,
  renderEntry,
  style,
  ariaAttributes,
}: IRowProps<TEntry> & {
  ariaAttributes: {
    'aria-posinset': number;
    'aria-setsize': number;
    role: 'listitem';
  };
  index: number;
  style: React.CSSProperties;
}): React.JSX.Element {
  const entry = entries[index];
  return (
    <div
      {...ariaAttributes}
      style={{ ...style, boxSizing: 'border-box' }}
      data-settings-entry-id={entry.id}
    >
      {renderEntry(entry)}
    </div>
  );
}

/**
 * Virtualizes variable-height setting sections/search hits and owns indexed
 * navigation. Re-aligning after the target row mounts makes estimated heights
 * harmless for direct jumps, even when most preceding rows were never rendered.
 */
export function VirtualizedSettingsList<TEntry extends IVirtualizedSettingsEntry>({
  entries,
  renderEntry,
  navigationRequest,
  onNavigationComplete,
  defaultRowHeight = 240,
  virtualize = true,
}: IVirtualizedSettingsListProps<TEntry>): React.JSX.Element {
  const [list, setList] = useListCallbackRef();
  const entryOrderKey = useMemo(() => entries.map(({ id }) => id).join('\u0000'), [entries]);
  const estimatedDefaultRowHeight = useMemo(() => {
    if (entries.length === 0) return defaultRowHeight;
    const total = entries.reduce((sum, entry) => sum + (entry.estimatedHeight ?? defaultRowHeight), 0);
    return Math.round(total / entries.length);
  }, [defaultRowHeight, entries]);
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: estimatedDefaultRowHeight, key: entryOrderKey });
  const targetIndex = navigationRequest
    ? entries.findIndex(({ id }) => id === navigationRequest.sectionId)
    : -1;
  const settleFrame = useRef<number | undefined>(undefined);
  const fallbackContainer = useRef<HTMLDivElement>(null);
  const canVirtualize = virtualize && typeof ResizeObserver !== 'undefined';

  const rowProps = useMemo<IRowProps<TEntry>>(() => ({ entries, renderEntry }), [entries, renderEntry]);
  const rowKey = useCallback((index: number, data: IRowProps<TEntry>) => data.entries[index].id, []);

  useEffect(() => {
    if (!navigationRequest) return;
    if (targetIndex < 0) {
      onNavigationComplete?.(navigationRequest.requestId);
      return;
    }
    if (!canVirtualize) {
      const alignFallbackTarget = (attempt: number) => {
        const target = Array.from(fallbackContainer.current?.children ?? []).find(
          (element) => (element as HTMLElement).dataset.settingsEntryId === navigationRequest.sectionId,
        );
        const scrollViewport = fallbackContainer.current?.parentElement;
        if (target && scrollViewport) {
          const offset = target.getBoundingClientRect().top - scrollViewport.getBoundingClientRect().top;
          scrollViewport.scrollTop += offset;
        }
        if (attempt < 5) {
          settleFrame.current = requestAnimationFrame(() => {
            alignFallbackTarget(attempt + 1);
          });
        } else {
          onNavigationComplete?.(navigationRequest.requestId);
        }
      };
      alignFallbackTarget(0);
      return;
    }
    list?.scrollToRow({
      align: 'start',
      behavior: navigationRequest.behavior,
      index: targetIndex,
    });
  }, [canVirtualize, list, navigationRequest, onNavigationComplete, targetIndex]);

  const handleRowsRendered = useCallback((_visibleRows: { startIndex: number; stopIndex: number }, allRows: { startIndex: number; stopIndex: number }) => {
    if (!navigationRequest || !list || targetIndex < allRows.startIndex || targetIndex > allRows.stopIndex) return;
    cancelAnimationFrame(settleFrame.current ?? 0);
    settleFrame.current = requestAnimationFrame(() => {
      // The first scroll uses estimates. Once the row is mounted and measured,
      // align it again against the updated dynamic-height cache.
      list.scrollToRow({ align: 'start', behavior: 'instant', index: targetIndex });
      settleFrame.current = requestAnimationFrame(() => {
        onNavigationComplete?.(navigationRequest.requestId);
      });
    });
  }, [list, navigationRequest, onNavigationComplete, targetIndex]);

  useEffect(() => () => {
    cancelAnimationFrame(settleFrame.current ?? 0);
  }, []);

  if (!canVirtualize) {
    return (
      <FallbackViewport data-settings-scroll-viewport='true'>
        <div ref={fallbackContainer}>
          {entries.map((entry) => (
            <div key={entry.id} data-settings-entry-id={entry.id}>
              {renderEntry(entry)}
            </div>
          ))}
        </div>
      </FallbackViewport>
    );
  }

  return (
    <Viewport>
      <List
        data-settings-scroll-viewport='true'
        defaultHeight={800}
        listRef={setList}
        rowComponent={SettingsRow<TEntry>}
        rowCount={entries.length}
        rowHeight={dynamicRowHeight}
        rowKey={rowKey}
        rowProps={rowProps}
        overscanCount={2}
        onRowsRendered={handleRowsRendered}
        style={{ height: '100%', width: '100%' }}
      />
    </Viewport>
  );
}
