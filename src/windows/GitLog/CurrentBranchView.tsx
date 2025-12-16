import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import type React from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { List as VirtualList } from 'react-window';
import { useInfiniteLoader } from 'react-window-infinite-loader';

import { CommitTableRow } from './CommitTableRow';
import { SearchBar } from './SearchBar';
import { HEADER_AND_CONTROLS_HEIGHT, ROW_HEIGHT } from './styles';
import type { GitLogEntry, ISearchParameters } from './types';

interface ICurrentBranchViewProps {
  entries: GitLogEntry[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  selectedCommit: GitLogEntry | undefined;
  currentSearchParameters: ISearchParameters;
  onSearch: (parameters: ISearchParameters) => void;
  onSelectCommit: (entry: GitLogEntry) => void;
  onSyncClick: () => Promise<void>;
  isRowLoaded: (index: number) => boolean;
  loadMoreRows: (startIndex: number, stopIndex: number) => Promise<void>;
}

export function CurrentBranchView({
  entries,
  loading,
  loadingMore,
  hasMore,
  selectedCommit,
  currentSearchParameters,
  onSearch,
  onSelectCommit,
  onSyncClick,
  isRowLoaded,
  loadMoreRows,
}: ICurrentBranchViewProps): React.JSX.Element {
  const { t } = useTranslation();

  const onRowsRendered = useInfiniteLoader({
    isRowLoaded,
    loadMoreRows,
    rowCount: hasMore ? entries.length + 1 : entries.length,
  });

  const handleRowSelect = useCallback(
    (entry: GitLogEntry) => {
      onSelectCommit(entry);
    },
    [onSelectCommit],
  );

  return (
    <>
      <SearchBar onSearch={onSearch} disabled={loading} currentSearchParams={currentSearchParameters} />
      {entries.length > 0
        ? (
          <VirtualList
            defaultHeight={window.innerHeight - HEADER_AND_CONTROLS_HEIGHT}
            rowCount={entries.length}
            rowHeight={ROW_HEIGHT}
            rowProps={{}}
            onRowsRendered={onRowsRendered}
            rowComponent={({ index, style }) => {
              const entry = entries[index];
              // Should always exist, but TypeScript doesn't know that
              if (!entry) return <div style={style} />;

              const commitDate = new Date(entry.committerDate);
              const isSelected = selectedCommit?.hash === entry.hash;

              return (
                <div style={style}>
                  <CommitTableRow
                    commit={entry}
                    selected={isSelected}
                    commitDate={commitDate}
                    onSelect={() => {
                      handleRowSelect(entry);
                    }}
                    onSyncClick={onSyncClick}
                  />
                </div>
              );
            }}
          />
        )
        : (
          <Box p={2}>
            <Typography>{t('GitLog.NoCommits')}</Typography>
          </Box>
        )}
      {loadingMore && (
        <Box p={2} display='flex' justifyContent='center'>
          <CircularProgress size={24} />
          <Typography ml={1}>{t('GitLog.LoadingMore')}</Typography>
        </Box>
      )}
    </>
  );
}
