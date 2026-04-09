import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import { IconButton, InputAdornment, TextField } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';

const SearchTextField = styled(TextField)`
  margin-bottom: 16px;
  width: 100%;

  & .MuiInputBase-root {
    border-radius: 8px;
    background: ${({ theme }) => theme.palette.background.paper};
  }
`;

interface SearchBarProps {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  value: string;
}

export function SearchBar({ value, onChange, inputRef }: SearchBarProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <SearchTextField
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      placeholder={t('Preference.SearchPlaceholder')}
      variant='outlined'
      size='small'
      slotProps={{
        htmlInput: { ref: inputRef },
        input: {
          startAdornment: (
            <InputAdornment position='start'>
              <SearchIcon fontSize='small' color='action' />
            </InputAdornment>
          ),
          endAdornment: value
            ? (
              <InputAdornment position='end'>
                <IconButton
                  size='small'
                  onClick={() => {
                    onChange('');
                  }}
                  edge='end'
                  aria-label='clear search'
                >
                  <ClearIcon fontSize='small' />
                </IconButton>
              </InputAdornment>
            )
            : null,
        },
      }}
    />
  );
}
