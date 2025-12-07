import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import { styled } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { enUS, zhCN } from 'date-fns/locale';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type SearchMode = 'message' | 'file' | 'dateRange' | 'none';

export interface ISearchParameters {
  mode: SearchMode;
  query: string;
  startDate: Date | null;
  endDate: Date | null;
}

interface ISearchBarProps {
  onSearch: (parameters: ISearchParameters) => void;
  disabled?: boolean;
  currentSearchParams?: ISearchParameters;
}

const SearchContainer = styled(Box)`
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  align-items: flex-start;
  overflow: hidden;
`;

const SearchModeSelect = styled(FormControl)`
  min-width: 120px;
`;

const SearchInputContainer = styled(Box)`
  flex: 1;
  display: flex;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
`;

export function SearchBar({ onSearch, disabled = false, currentSearchParams }: ISearchBarProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<SearchMode>('none');
  const [query, setQuery] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const locale = i18n.language.startsWith('zh') ? zhCN : enUS;

  // Sync with external search params
  useEffect(() => {
    if (currentSearchParams) {
      setMode(currentSearchParams.mode);
      setQuery(currentSearchParams.query);
      setStartDate(currentSearchParams.startDate);
      setEndDate(currentSearchParams.endDate);
    }
  }, [currentSearchParams]);

  const handleModeChange = (event: SelectChangeEvent<SearchMode>) => {
    const newMode = event.target.value as SearchMode;
    setMode(newMode);

    // Auto-trigger search when switching to none mode (clear search)
    if (newMode === 'none') {
      setQuery('');
      setStartDate(null);
      setEndDate(null);
      onSearch({ mode: 'none', query: '', startDate: null, endDate: null });
    }
  };

  const handleSearch = () => {
    if (mode === 'none') return;

    if (mode === 'dateRange') {
      // Date range search doesn't require query
      onSearch({ mode, query: '', startDate, endDate });
    } else if (query.trim()) {
      // Message and file search require query
      onSearch({ mode, query: query.trim(), startDate: null, endDate: null });
    }
  };

  const handleClear = () => {
    setMode('none');
    setQuery('');
    setStartDate(null);
    setEndDate(null);
    onSearch({ mode: 'none', query: '', startDate: null, endDate: null });
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  const isSearchable = mode !== 'none' && (
    mode === 'dateRange' || query.trim().length > 0
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locale}>
      <SearchContainer>
        <SearchModeSelect size='small' disabled={disabled}>
          <InputLabel>{t('GitLog.SearchMode')}</InputLabel>
          <Select
            value={mode}
            label={t('GitLog.SearchMode')}
            onChange={handleModeChange}
          >
            <MenuItem value='none'>{t('GitLog.InfiniteScroll')}</MenuItem>
            <MenuItem value='message'>{t('GitLog.MessageSearch')}</MenuItem>
            <MenuItem value='file'>{t('GitLog.FileNameSearch')}</MenuItem>
            <MenuItem value='dateRange'>{t('GitLog.DateRangeSearch')}</MenuItem>
          </Select>
        </SearchModeSelect>

        <SearchInputContainer>
          {mode === 'message' && (
            <TextField
              size='small'
              fullWidth
              placeholder={t('GitLog.SearchCommits')}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={handleKeyPress}
              disabled={disabled}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                      <SearchIcon />
                    </InputAdornment>
                  ),
                },
              }}
            />
          )}

          {mode === 'file' && (
            <TextField
              size='small'
              fullWidth
              placeholder='*.tsx'
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={handleKeyPress}
              disabled={disabled}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                      <SearchIcon />
                    </InputAdornment>
                  ),
                },
              }}
            />
          )}

          {mode === 'dateRange' && (
            <>
              <DatePicker
                label={t('GitLog.StartDate')}
                value={startDate}
                onChange={(newValue) => {
                  setStartDate(newValue);
                }}
                disabled={disabled}
                slotProps={{ textField: { size: 'small', sx: { minWidth: 0, flex: 1 } } }}
              />
              <DatePicker
                label={t('GitLog.EndDate')}
                value={endDate}
                onChange={(newValue) => {
                  setEndDate(newValue);
                }}
                disabled={disabled}
                slotProps={{ textField: { size: 'small', sx: { minWidth: 0, flex: 1 } } }}
              />
            </>
          )}

          {mode !== 'none' && (
            <>
              <IconButton
                size='small'
                onClick={handleSearch}
                disabled={disabled || !isSearchable}
                color='primary'
              >
                <SearchIcon />
              </IconButton>
              <IconButton
                size='small'
                onClick={handleClear}
                disabled={disabled}
              >
                <ClearIcon />
              </IconButton>
            </>
          )}
        </SearchInputContainer>
      </SearchContainer>
    </LocalizationProvider>
  );
}
