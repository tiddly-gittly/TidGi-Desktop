import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import { styled } from '@mui/material/styles';

import { getFileStatusStyles, type GitFileStatus } from './fileStatusStyles';

export const HEADER_AND_CONTROLS_HEIGHT = 250;
export const ROW_HEIGHT = 60;

const RootComponent = (props: React.ComponentProps<typeof Container>) => <Container {...props} />;

export const Root = styled(RootComponent)`
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
`;

export const ContentWrapper = styled(Box)`
  display: flex;
  flex: 1;
  gap: 8px;
  overflow: hidden;
`;

export const GitLogWrapper = styled(Box)`
  width: 600px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: 4px;
  color: ${({ theme }) => theme.palette.text.primary};
`;

export const TabsContainer = styled(Box)`
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
`;

export const TabContent = styled(Box)`
  flex: 1;
  overflow: hidden;
`;

export const StyledTableRow = styled(Box)<{ selected?: boolean }>`
  display: flex;
  align-items: center;
  padding: 8px;
  cursor: pointer;
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  
  &:hover {
    background-color: ${({ theme }) => theme.palette.action.hover};
  }

  ${({ selected, theme }) =>
  selected
    ? `
    background-color: ${theme.palette.action.selected};
    
    &:hover {
      background-color: ${theme.palette.action.selected};
    }
  `
    : ''}
`;

export const CellBox = styled(Box)`
  padding: 0 8px;
  overflow: hidden;
`;

export const DetailsWrapper = styled(Box)`
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
`;

export const DetailsPanelWrapper = styled(Box)`
  flex: 1;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: 4px;
`;

export const DiffPanelWrapper = styled(Box)`
  flex: 1;
  min-width: 400px;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: 4px;
`;

export const LoadingContainer = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

export const FileChip = styled(Box)<{ $status?: GitFileStatus }>`
  display: inline-block;
  font-size: 0.7rem;
  font-family: monospace;
  padding: 2px 4px;
  margin: 2px;
  border-radius: 3px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  ${({ $status, theme }) => getFileStatusStyles($status, theme)}
`;
