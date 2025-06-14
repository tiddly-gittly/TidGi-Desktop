import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Collapse, IconButton } from '@mui/material';
import { styled } from '@mui/material/styles';

export const StyledCollapse = styled(Collapse)`
  border-top: 1px solid ${({ theme }) => theme.palette.divider};
`;

export const StyledExpandButton = styled(IconButton)`
  padding: ${({ theme }) => theme.spacing(0.5)};
  margin-left: ${({ theme }) => theme.spacing(1)};
  color: ${({ theme }) => theme.palette.text.secondary};
  transition: ${({ theme }) =>
  theme.transitions.create(['color', 'transform'], {
    duration: theme.transitions.duration.short,
  })};
  
  &:hover {
    color: ${({ theme }) => theme.palette.primary.main};
  }
`;

export const ExpandIcon = styled(ExpandMoreIcon)`
  transition: ${({ theme }) =>
  theme.transitions.create('transform', {
    duration: theme.transitions.duration.short,
  })};
`;

export const CollapseIcon = styled(ExpandLessIcon)`
  transition: ${({ theme }) =>
  theme.transitions.create('transform', {
    duration: theme.transitions.duration.short,
  })};
`;
