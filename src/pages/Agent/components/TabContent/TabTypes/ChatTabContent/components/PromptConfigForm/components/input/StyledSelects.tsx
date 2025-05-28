import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import styled from 'styled-components';

export const StyledSelect = styled(Select)`
  font-size: ${({ theme }) => theme.typography.body2.fontSize};

  & .MuiSelect-select {
    padding-top: ${({ theme }) => theme.spacing(1)};
    padding-bottom: ${({ theme }) => theme.spacing(1)};
  }
`;

export const StyledSelectFormControl = styled(FormControl)`
  margin-bottom: ${({ theme }) => theme.spacing(1)};
  min-width: ${({ theme }) => theme.spacing(15)};
`;

export const StyledInputLabel = styled(InputLabel)`
  font-size: ${({ theme }) => theme.typography.body2.fontSize};
`;

export const StyledMenuItem = styled(MenuItem)`
  font-size: ${({ theme }) => theme.typography.body2.fontSize};
  padding: ${({ theme }) => theme.spacing(1, 2)};

  &:hover {
    background-color: ${({ theme }) => theme.palette.action.hover};
  }

  &.Mui-selected {
    background-color: ${({ theme }) => theme.palette.primary.light};

    &:hover {
      background-color: ${({ theme }) => theme.palette.primary.main};
    }
  }
`;
