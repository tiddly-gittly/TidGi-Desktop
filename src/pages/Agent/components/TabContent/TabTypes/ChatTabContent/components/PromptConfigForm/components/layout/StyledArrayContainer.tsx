import { Box, Typography } from '@mui/material';
import styled from 'styled-components';
import { StyledCard, StyledCardContent } from './StyledCard';

// Array container styles
export const ArrayContainer: typeof Box = styled(Box)`
  width: 100%;
`;

export const ArrayHeader: typeof Box = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing(0.5)};
`;

export const EmptyState: typeof Box = styled(Box)`
  padding: ${({ theme }) => theme.spacing(3)};
  text-align: center;
  color: ${({ theme }) => theme.palette.text.secondary};
  border: 2px dashed ${({ theme }) => theme.palette.divider};
  border-radius: ${({ theme }) => theme.shape.borderRadius}px;
  margin-bottom: ${({ theme }) => theme.spacing(0.5)};
`;

// Array item styles
export const ArrayItemCard = styled(StyledCard)<{ $isDragging?: boolean }>`
  border: none;
  padding-left: 0;
  padding-right: 0;
  box-shadow: none;
  transition: ${({ theme }) =>
  theme.transitions.create(['border-color', 'transform'], {
    duration: theme.transitions.duration.short,
  })};

  ${({ $isDragging, theme }) =>
  $isDragging &&
  `
    border-color: ${theme.palette.primary.main};
    transform: scale(1.02);
  `}

  &:hover {
    border-color: ${({ theme }) => theme.palette.primary.light};
  }
`;

export const ArrayItemHeader: typeof Box = styled(Box)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing(1)};
  padding: ${({ theme }) => theme.spacing(1.5, 2)};
  background-color: ${({ theme }) => theme.palette.action.hover};
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
`;

export const ItemContent = styled(StyledCardContent)`
  padding: 0;
`;

// Drag handle styles
export const DragHandle: typeof Box = styled(Box)`
  display: flex;
  align-items: center;
  cursor: grab;
  color: ${({ theme }) => theme.palette.text.secondary};
  padding: ${({ theme }) => theme.spacing(0.5)};
  border-radius: ${({ theme }) => theme.shape.borderRadius / 2}px;
  
  &:hover {
    color: ${({ theme }) => theme.palette.primary.main};
    background-color: ${({ theme }) => theme.palette.action.hover};
  }
  
  &:active {
    cursor: grabbing;
    background-color: ${({ theme }) => theme.palette.action.selected};
  }
`;

export const ArrayItemTitle = styled(Typography)`
  flex: 1;
  font-weight: 500;
  font-size: ${({ theme }) => theme.typography.body2.fontSize};
  color: ${({ theme }) => theme.palette.text.primary};
`;

export const ArrayItemCount = styled(Typography)`
  font-size: ${({ theme }) => theme.typography.caption.fontSize};
  color: ${({ theme }) => theme.palette.text.secondary};
  margin-left: auto;
`;
