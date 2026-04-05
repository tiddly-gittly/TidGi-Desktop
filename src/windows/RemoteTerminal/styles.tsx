import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import { styled } from "@mui/material/styles";

export const Root = styled(Container)`
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
  background: ${({ theme }) =>
    theme.palette.mode === "dark" ? "#0a0a0a" : "#fafafa"};
`;

export const Header = styled(Box)`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  padding: 12px;
  background: ${({ theme }) => theme.palette.background.paper};
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: 8px;
`;

export const ContentWrapper = styled(Box)`
  display: flex;
  flex: 1;
  gap: 16px;
  overflow: hidden;
`;

export const SessionListWrapper = styled(Box)`
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: ${({ theme }) => theme.palette.background.paper};
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: 8px;
`;

export const SessionListHeader = styled(Box)`
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  font-weight: 600;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.palette.text.secondary};
`;

export const SessionListContent = styled(Box)`
  flex: 1;
  overflow-y: auto;
  padding: 8px;
`;

export const SessionItem = styled(Box)<{ selected?: boolean }>`
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  border-radius: 6px;
  border: 1px solid
    ${({ theme, selected }) =>
      selected ? theme.palette.primary.main : theme.palette.divider};
  background: ${({ theme, selected }) =>
    selected ? theme.palette.action.selected : "transparent"};
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.palette.action.hover};
    border-color: ${({ theme }) => theme.palette.primary.light};
  }
`;

export const TerminalWrapper = styled(Box)`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: ${({ theme }) => theme.palette.background.paper};
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: 8px;
`;

export const TerminalHeader = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  background: ${({ theme }) =>
    theme.palette.mode === "dark" ? "#1a1a1a" : "#f5f5f5"};
`;

export const TerminalOutput = styled(Box)`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.5;
  background: ${({ theme }) =>
    theme.palette.mode === "dark" ? "#0d0d0d" : "#ffffff"};
  color: ${({ theme }) =>
    theme.palette.mode === "dark" ? "#e0e0e0" : "#1a1a1a"};
  white-space: pre-wrap;
  word-break: break-all;
`;

export const TerminalInputWrapper = styled(Box)`
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid ${({ theme }) => theme.palette.divider};
  background: ${({ theme }) =>
    theme.palette.mode === "dark" ? "#1a1a1a" : "#f5f5f5"};
`;

export const LoadingContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
`;

export const EmptyState = styled(Box)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: ${({ theme }) => theme.palette.text.secondary};
`;
