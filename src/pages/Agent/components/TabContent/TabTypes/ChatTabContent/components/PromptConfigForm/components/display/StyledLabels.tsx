import { Typography } from '@mui/material';
import styled from 'styled-components';

export const StyledFieldLabel: typeof Typography = styled(Typography)`
  font-size: ${({ theme }) => theme.typography.subtitle2.fontSize};
  font-weight: ${({ theme }) => theme.typography.subtitle2.fontWeight};
  color: ${({ theme }) => theme.palette.text.primary};
  margin-bottom: ${({ theme }) => theme.spacing(0.5)};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing(0.5)};
`;

export const StyledSubsectionTitle = styled(Typography)`
  font-size: ${({ theme }) => theme.typography.subtitle1.fontSize};
  font-weight: ${({ theme }) => theme.typography.subtitle1.fontWeight};
  color: ${({ theme }) => theme.palette.text.secondary};
  margin-bottom: ${({ theme }) => theme.spacing(0.5)};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing(0.5)};
`;

export const StyledDescription = styled(Typography)`
  font-size: ${({ theme }) => theme.typography.caption.fontSize};
  color: ${({ theme }) => theme.palette.text.secondary};
  margin-bottom: ${({ theme }) => theme.spacing(1)};
  font-style: italic;
`;

export const StyledRequiredIndicator = styled.span`
  color: ${({ theme }) => theme.palette.error.main};
  font-size: ${({ theme }) => theme.typography.caption.fontSize};
  margin-left: ${({ theme }) => theme.spacing(0.25)};
`;
