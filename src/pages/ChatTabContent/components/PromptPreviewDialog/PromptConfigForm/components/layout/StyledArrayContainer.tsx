import { Box, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { StyledCard, StyledCardContent } from './StyledCard';

// Array container styles
export const ArrayContainer = styled((props: React.ComponentProps<typeof Box>) => <Box {...props} />)`
  width: 100%;
`;

export const ArrayHeader = styled((props: React.ComponentProps<typeof Box>) => <Box {...props} />)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing(0.5)};
`;

export const EmptyState = styled((props: React.ComponentProps<typeof Box>) => <Box {...props} />)`
  padding: ${({ theme }) => theme.spacing(3)};
  text-align: center;
  color: ${({ theme }) => theme.palette.text.secondary};
  border: 2px dashed ${({ theme }) => theme.palette.divider};
  border-radius: ${({ theme }) => theme.shape.borderRadius}px;
  margin-bottom: ${({ theme }) => theme.spacing(0.5)};
`;

// Array item styles
export const ArrayItemCard = styled(StyledCard, {
  shouldForwardProp: (property) => property !== '$isDragging',
})<{ $isDragging?: boolean }>`
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

export const ArrayItemHeader = styled(Box, {
  shouldForwardProp: (property) => property !== '$isCollapsible',
})<{ $isCollapsible?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing(1)};
  padding: ${({ theme }) => theme.spacing(1.5, 2)};
  background-color: ${({ theme }) => theme.palette.action.hover};
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  cursor: ${({ $isCollapsible }) => ($isCollapsible ? 'pointer' : 'default')};
  
  &:hover {
    background-color: ${({ theme, $isCollapsible }) => $isCollapsible ? theme.palette.action.selected : theme.palette.action.hover};
  }
`;

export const ItemContent = styled(StyledCardContent)`
  padding: 0;
`;

// Drag handle styles
export const DragHandle = styled((props: React.ComponentProps<typeof Box>) => <Box {...props} />)`
  display: flex;
  align-items: center;
  cursor: grab;
  color: ${({ theme }) => theme.palette.text.secondary};
  padding: ${({ theme }) => theme.spacing(0.5)};
  border-radius: calc(${({ theme }) => theme.shape.borderRadius}px / 2);
  
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
