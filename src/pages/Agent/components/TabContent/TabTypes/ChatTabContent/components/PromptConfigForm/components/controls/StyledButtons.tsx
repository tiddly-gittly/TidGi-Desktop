import { Button } from '@mui/material';
import styled from 'styled-components';

export const StyledActionButton = styled(Button)`
  min-width: auto;
  padding: ${({ theme }) => theme.spacing(0.5, 1)};
  font-size: ${({ theme }) => theme.typography.caption.fontSize};
  text-transform: none;
  border-radius: ${({ theme }) => theme.shape.borderRadius}px;
`;

export const StyledToggleButton = styled(Button)<{ $enabled?: boolean }>`
  min-width: auto;
  padding: ${({ theme }) => theme.spacing(0.5, 1)};
  font-size: ${({ theme }) => theme.typography.caption.fontSize};
  text-transform: none;
  border-radius: ${({ theme }) => theme.shape.borderRadius}px;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  
  ${({ theme, $enabled }) =>
  $enabled
    ? `
    background-color: ${theme.palette.success.light};
    border-color: ${theme.palette.success.main};
    color: ${theme.palette.success.contrastText};
  `
    : `
    background-color: ${theme.palette.action.disabledBackground};
    border-color: ${theme.palette.divider};
    color: ${theme.palette.text.disabled};
  `}
`;
