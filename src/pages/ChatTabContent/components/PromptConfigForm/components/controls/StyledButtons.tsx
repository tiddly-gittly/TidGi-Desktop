import { Button, IconButton } from '@mui/material';
import { styled } from '@mui/material/styles';

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

// Array-specific button styles
export const StyledArrayAddButton = styled(StyledActionButton)`
  margin: ${({ theme }) => theme.spacing(1, 0)};
  padding: ${({ theme }) => theme.spacing(1.5, 3)};
  color: ${({ theme }) => theme.palette.primary.main};
  border-color: ${({ theme }) => theme.palette.primary.main};
  font-size: ${({ theme }) => theme.typography.body2.fontSize};
  min-height: 48px;
  
  &:hover {
    background-color: ${({ theme }) => theme.palette.primary.light};
    color: ${({ theme }) => theme.palette.primary.contrastText};
  }
`;

export const StyledDeleteButton = styled(IconButton)`
  color: ${({ theme }) => theme.palette.error.main};
  padding: ${({ theme }) => theme.spacing(0.5)};
  
  &:hover {
    background-color: ${({ theme }) => theme.palette.error.light};
    color: ${({ theme }) => theme.palette.error.contrastText};
  }
`;
