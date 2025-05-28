import { Card, CardContent } from '@mui/material';
import styled from 'styled-components';

export const StyledCard = styled(Card)`
  margin-bottom: ${({ theme }) => theme.spacing(2)};
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: ${({ theme }) => theme.shape.borderRadius}px;
  box-shadow: ${({ theme }) => theme.shadows[1]};
  transition: ${({ theme }) =>
  theme.transitions.create(['box-shadow', 'border-color'], {
    duration: theme.transitions.duration.short,
  })};
  
  &:hover {
    box-shadow: ${({ theme }) => theme.shadows[2]};
    border-color: ${({ theme }) => theme.palette.primary.main};
  }
`;

export const StyledCardContent = styled(CardContent)`
  padding: ${({ theme }) => `${theme.spacing(2)} 2`};
  
  &:last-child {
    padding-bottom: ${({ theme }) => theme.spacing(2)};
  }
`;
