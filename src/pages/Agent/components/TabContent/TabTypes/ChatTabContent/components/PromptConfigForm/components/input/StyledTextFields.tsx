import { TextField } from '@mui/material';
import styled from 'styled-components';

export const StyledTextField = styled(TextField)`
  margin-bottom: ${({ theme }) => theme.spacing(1)};
  
  & .MuiInputBase-root {
    font-size: ${({ theme }) => theme.typography.body2.fontSize};
  }
  
  & .MuiInputLabel-root {
    font-size: ${({ theme }) => theme.typography.body2.fontSize};
  }
`;

export const StyledMultilineTextField = styled(StyledTextField)`
  & .MuiInputBase-root {
    font-size: ${({ theme }) => theme.typography.body2.fontSize};
    font-family: ${({ theme }) => theme.typography.fontFamily};
    line-height: 1.4;
  }
  
  & textarea {
    resize: vertical;
    min-height: ${({ theme }) => theme.spacing(6)};
  }
`;

export const StyledCodeTextField = styled(StyledMultilineTextField)`
  & .MuiInputBase-root {
    font-family: 'Monaco, Menlo, "Ubuntu Mono", consolas, monospace';
    font-size: ${({ theme }) => theme.typography.caption.fontSize};
    background-color: ${({ theme }) => theme.palette.action.hover};
  }
  
  & textarea {
    min-height: ${({ theme }) => theme.spacing(12)};
  }
`;

export const StyledNumberField = styled(StyledTextField)`
  & input[type="number"] {
    -moz-appearance: textfield;
  }
  
  & input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  
  & input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`;
