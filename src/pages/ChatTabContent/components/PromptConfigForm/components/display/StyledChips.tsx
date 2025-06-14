import { Chip } from '@mui/material';
import { styled } from '@mui/material/styles';

export const StyledChip = styled(Chip)`
  margin: ${({ theme }) => theme.spacing(0.25)};
  font-size: ${({ theme }) => theme.typography.caption.fontSize};
  height: ${({ theme }) => theme.spacing(3)};
`;

export const StyledTypeChip = styled(StyledChip)`
  background-color: ${({ theme }) => theme.palette.primary.light};
  color: ${({ theme }) => theme.palette.primary.contrastText};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
`;

export const StyledStatusChip = styled(StyledChip)<{ $enabled?: boolean }>`
  background-color: ${({ theme, $enabled }) => $enabled ? theme.palette.success.light : theme.palette.error.light};
  color: ${({ theme, $enabled }) => $enabled ? theme.palette.success.contrastText : theme.palette.error.contrastText};
`;

export const StyledTagChip = styled(StyledChip)`
  background-color: ${({ theme }) => theme.palette.secondary.light};
  color: ${({ theme }) => theme.palette.secondary.contrastText};
  
  &:hover {
    background-color: ${({ theme }) => theme.palette.secondary.main};
  }
`;
