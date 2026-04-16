import { Helmet } from '@dr.pogodin/react-helmet';
import RefreshIcon from '@mui/icons-material/Refresh';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import TerminalIcon from '@mui/icons-material/Terminal';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Snackbar from '@mui/material/Snackbar';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AnsiToHtml from 'ansi-to-html';
import type { TerminalSessionInfo } from 'memeloop-node';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { WindowNames } from '@services/windows/WindowProperties';
import type { WindowMeta } from '@services/windows/WindowProperties';
import {
  ContentWrapper,
  EmptyState,
  Header,
  LoadingContainer,
  Root,
  SessionItem,
  SessionListContent,
  SessionListHeader,
  SessionListWrapper,
  TerminalHeader,
  TerminalInputWrapper,
  TerminalOutput,
  TerminalWrapper,
} from './styles';

const ansiConverter = new AnsiToHtml({
  fg: '#e0e0e0',
  bg: '#0d0d0d',
  newline: true,
  escapeXML: true,
});

interface ConnectedPeer {
  nodeId: string;
  name: string;
  type: 'desktop' | 'node' | 'mobile';
  status: 'online' | 'offline' | 'unknown';
}

export default function RemoteTerminal(): React.JSX.Element {
  const { t } = useTranslation();
  const meta = window.meta() as WindowMeta[WindowNames.remoteTerminal];
  const outputRef = useRef<HTMLDivElement>(null);

  const [peers, setPeers] = useState<ConnectedPeer[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(
    meta.nodeId ?? '',
  );
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [terminalOutput, setTerminalOutput] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextSeq, setNextSeq] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadPeers = useCallback(async () => {
    try {
      const connectedPeers = await window.service.memeloopNode.getConnectedPeers();
      setPeers(connectedPeers);
      if (connectedPeers.length > 0 && !selectedNodeId) {
        setSelectedNodeId(connectedPeers[0].nodeId);
      }
    } catch (error) {
      console.error('Failed to load peers:', error);
      setError('Failed to load connected nodes');
    }
  }, [selectedNodeId]);

  const loadSessions = useCallback(async () => {
    if (!selectedNodeId) return;

    setLoading(true);
    try {
      const sessionList = await window.service.remoteTerminal.listSessions(selectedNodeId);
      setSessions(sessionList);
      if (sessionList.length > 0 && !selectedSessionId) {
        setSelectedSessionId(sessionList[0].sessionId);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      setError('Failed to load terminal sessions');
    } finally {
      setLoading(false);
    }
  }, [selectedNodeId, selectedSessionId]);

  const loadTerminalOutput = useCallback(async () => {
    if (!selectedNodeId || !selectedSessionId) return;

    try {
      const result = await window.service.remoteTerminal.followSession(
        selectedNodeId,
        selectedSessionId,
        nextSeq,
        false,
        5000,
      );

      if (result.chunks.length > 0) {
        const newOutput = result.chunks
          .map((chunk: { data: string }) => chunk.data)
          .join('');

        setTerminalOutput((prev) => prev + newOutput);
        setNextSeq(result.nextSeq);
      }

      if (result.done) {
        setAutoRefresh(false);
      }
    } catch (error) {
      console.error('Failed to load terminal output:', error);
    }
  }, [selectedNodeId, selectedSessionId, nextSeq]);

  const handleSendInput = useCallback(async () => {
    if (!selectedNodeId || !selectedSessionId || !inputValue.trim()) return;

    try {
      await window.service.remoteTerminal.respondToSession(
        selectedNodeId,
        selectedSessionId,
        inputValue + '\n',
      );
      setInputValue('');
    } catch (error) {
      console.error('Failed to send input:', error);
      setError('Failed to send input to terminal');
    }
  }, [selectedNodeId, selectedSessionId, inputValue]);

  const handleCancelSession = useCallback(async () => {
    if (!selectedNodeId || !selectedSessionId) return;

    try {
      await window.service.remoteTerminal.cancelSession(
        selectedNodeId,
        selectedSessionId,
      );
      setAutoRefresh(false);
      await loadSessions();
    } catch (error) {
      console.error('Failed to cancel session:', error);
      setError('Failed to cancel terminal session');
    }
  }, [selectedNodeId, selectedSessionId, loadSessions]);

  const handleSessionSelect = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    setTerminalOutput('');
    setNextSeq(1);
    setAutoRefresh(true);
  }, []);

  useEffect(() => {
    loadPeers();
  }, [loadPeers]);

  useEffect(() => {
    if (selectedNodeId) {
      loadSessions();
    }
  }, [selectedNodeId, loadSessions]);

  useEffect(() => {
    if (autoRefresh && selectedSessionId) {
      const interval = setInterval(loadTerminalOutput, 1000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, selectedSessionId, loadTerminalOutput]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  const selectedSession = sessions.find(
    (s) => s.sessionId === selectedSessionId,
  );
  const htmlOutput = terminalOutput ? ansiConverter.toHtml(terminalOutput) : '';

  return (
    <Root maxWidth={false}>
      <Helmet>
        <title>{t('RemoteTerminal.Title')}</title>
      </Helmet>

      <Header>
        <TerminalIcon color='primary' />
        <Typography variant='h6' sx={{ flex: 1 }}>
          Remote Terminal
        </Typography>
        <FormControl size='small' sx={{ minWidth: 250 }}>
          <InputLabel>Node</InputLabel>
          <Select
            value={selectedNodeId}
            label='Node'
            onChange={(e) => setSelectedNodeId(e.target.value)}
          >
            {peers.length === 0 && (
              <MenuItem value='' disabled>
                No connected nodes
              </MenuItem>
            )}
            {peers.map((peer) => (
              <MenuItem key={peer.nodeId} value={peer.nodeId}>
                {peer.name} ({peer.type})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <IconButton onClick={loadSessions} disabled={!selectedNodeId}>
          <RefreshIcon />
        </IconButton>
      </Header>

      {loading && (
        <LoadingContainer>
          <CircularProgress />
          <Typography variant='body2' color='textSecondary'>
            Loading terminal sessions...
          </Typography>
        </LoadingContainer>
      )}

      {!loading && selectedNodeId && (
        <ContentWrapper>
          <SessionListWrapper>
            <SessionListHeader>
              Terminal Sessions ({sessions.length})
            </SessionListHeader>
            <SessionListContent>
              {sessions.length === 0 && (
                <EmptyState>
                  <TerminalIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                  <Typography variant='body2'>
                    No active terminal sessions
                  </Typography>
                </EmptyState>
              )}
              {sessions.map((session) => (
                <SessionItem
                  key={session.sessionId}
                  selected={session.sessionId === selectedSessionId}
                  onClick={() => handleSessionSelect(session.sessionId)}
                >
                  <Typography variant='body2' fontWeight={600} noWrap>
                    {session.command}
                  </Typography>
                  <Typography variant='caption' color='textSecondary' noWrap>
                    {session.cwd}
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      mt: 1,
                    }}
                  >
                    <Typography
                      variant='caption'
                      sx={{
                        px: 1,
                        py: 0.5,
                        borderRadius: 1,
                        bgcolor: session.status === 'running'
                          ? 'success.main'
                          : 'error.main',
                        color: 'white',
                      }}
                    >
                      {session.status}
                    </Typography>
                    {session.exitCode !== null && (
                      <Typography variant='caption' color='textSecondary'>
                        Exit: {session.exitCode}
                      </Typography>
                    )}
                  </Box>
                </SessionItem>
              ))}
            </SessionListContent>
          </SessionListWrapper>

          <TerminalWrapper>
            {selectedSession
              ? (
                <>
                  <TerminalHeader>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant='body2' fontWeight={600}>
                        {selectedSession.command}
                      </Typography>
                      <Typography variant='caption' color='textSecondary'>
                        {selectedSession.cwd}
                      </Typography>
                    </Box>
                    <IconButton
                      size='small'
                      onClick={handleCancelSession}
                      disabled={selectedSession.status !== 'running'}
                      color='error'
                    >
                      <StopIcon />
                    </IconButton>
                  </TerminalHeader>

                  <TerminalOutput
                    ref={outputRef}
                    dangerouslySetInnerHTML={{
                      __html: htmlOutput ||
                        '<span style="opacity: 0.5;">No output yet...</span>',
                    }}
                  />

                  <TerminalInputWrapper>
                    <TextField
                      fullWidth
                      size='small'
                      placeholder='Type command and press Enter...'
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleSendInput();
                        }
                      }}
                      disabled={selectedSession.status !== 'running'}
                      sx={{
                        '& .MuiInputBase-root': {
                          fontFamily: 'Consolas, Monaco, Courier New, monospace',
                        },
                      }}
                    />
                    <Button
                      variant='contained'
                      onClick={handleSendInput}
                      disabled={selectedSession.status !== 'running' || !inputValue.trim()}
                      endIcon={<SendIcon />}
                    >
                      Send
                    </Button>
                  </TerminalInputWrapper>
                </>
              )
              : (
                <EmptyState>
                  <TerminalIcon sx={{ fontSize: 64, opacity: 0.3 }} />
                  <Typography variant='body1'>
                    Select a terminal session to view output
                  </Typography>
                </EmptyState>
              )}
          </TerminalWrapper>
        </ContentWrapper>
      )}

      {!loading && !selectedNodeId && (
        <EmptyState>
          <TerminalIcon sx={{ fontSize: 64, opacity: 0.3 }} />
          <Typography variant='body1'>No connected nodes available</Typography>
          <Typography variant='body2' color='textSecondary'>
            Connect to a memeloop node to view terminal sessions
          </Typography>
        </EmptyState>
      )}

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity='error' onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Root>
  );
}
