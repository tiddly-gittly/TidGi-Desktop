import { Card, CardContent } from '@mui/material';
import styled from 'styled-components';

export const StyledCard = styled(Card)`
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: ${({ theme }) => theme.shape.borderRadius}px;
  box-shadow: none;
  transition: ${({ theme }) =>
  theme.transitions.create(['border-color'], {
    duration: theme.transitions.duration.short,
  })};
  
  &:hover {
    border-color: ${({ theme }) => theme.palette.primary.main};
  }
`;

export const StyledCardContent = styled(CardContent)`
  padding: ${({ theme }) => `${theme.spacing(2)} ${theme.spacing(1)}`};
  
  &:last-child {
    padding-bottom: ${({ theme }) => theme.spacing(2)};
  }
`;
