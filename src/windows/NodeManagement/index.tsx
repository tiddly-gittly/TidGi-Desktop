import { Helmet } from '@dr.pogodin/react-helmet';
import type { KnownNodeEntry } from '@memeloop/protocol';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { ICloudDiscoveredNode, IConnectedPeer, NodeIdentityStatus } from '@services/memeloopNode/interface';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NodeCard } from './NodeCard';
import { PinPairingDialog } from './PinPairingDialog';
import { RevokeDialog } from './RevokeDialog';

const Container = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  backgroundColor: theme.palette.background.default,
  overflow: 'hidden',
}));

const Header = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3),
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
}));

const Content = styled(Box)(({ theme }) => ({
  flex: 1,
  overflow: 'auto',
  padding: theme.spacing(3),
}));

const Section = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(4),
}));

const SectionTitle = styled(Typography)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  fontWeight: 600,
  color: theme.palette.text.primary,
}));

const NodeGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
  gap: theme.spacing(2),
}));

const SectionCard = styled(Card)(({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: 'none',
  backgroundColor: theme.palette.background.paper,
}));

const CloudActionGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(2),
  gridTemplateColumns: 'minmax(0, 1fr)',
  [theme.breakpoints.up('md')]: {
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'flex-start',
  },
}));

const CloudLoginGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(2),
  gridTemplateColumns: 'minmax(0, 1fr)',
  [theme.breakpoints.up('md')]: {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr)) auto',
    alignItems: 'flex-start',
  },
}));

const CloudNodeCard = styled(Card)(({ theme }) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: 'none',
}));

interface NodeWithStatus extends IConnectedPeer {
  isTrusted: boolean;
  knownEntry?: KnownNodeEntry;
}

function formatLastSeen(lastSeen: ICloudDiscoveredNode['lastSeen']): string {
  if (lastSeen === null) {
    return 'Unknown';
  }

  const parsed = new Date(lastSeen);
  return Number.isNaN(parsed.getTime())
    ? String(lastSeen)
    : parsed.toLocaleString();
}

function getCloudNodeTestIdSegment(nodeId: string): string {
  const normalized = nodeId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'node';
}

export default function NodeManagement(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectedPeers, setConnectedPeers] = useState<IConnectedPeer[]>([]);
  const [knownNodes, setKnownNodes] = useState<KnownNodeEntry[]>([]);
  const [localPinCode, setLocalPinCode] = useState<string>('');
  const [identityStatus, setIdentityStatus] = useState<NodeIdentityStatus | null>(null);
  const [cloudUrlInput, setCloudUrlInput] = useState('');
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [cloudStatusError, setCloudStatusError] = useState<string | null>(null);
  const [cloudNodes, setCloudNodes] = useState<ICloudDiscoveredNode[]>([]);
  const [cloudNodesLoaded, setCloudNodesLoaded] = useState(false);
  const [cloudNodesLoading, setCloudNodesLoading] = useState(false);
  const [cloudNodesError, setCloudNodesError] = useState<string | null>(null);
  const [cloudActionError, setCloudActionError] = useState<string | null>(null);
  const [cloudActionSuccess, setCloudActionSuccess] = useState<string | null>(
    null,
  );
  const [savingCloudUrl, setSavingCloudUrl] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
  const cloudUrlDirtyReference = useRef(false);

  const [pairingDialogOpen, setPairingDialogOpen] = useState(false);
  const [pairingNodeId, setPairingNodeId] = useState<string | null>(null);

  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeNodeId, setRevokeNodeId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [peers, known, pinCode] = await Promise.all([
        window.service.memeloopNode.getConnectedPeers(),
        window.service.memeloopNode.getKnownNodes(),
        window.service.memeloopNode.getLocalPinCode(),
      ]);

      setConnectedPeers(peers);
      setKnownNodes(known);
      setLocalPinCode(pinCode);
    } catch (error_) {
      setError(
        error_ instanceof Error ? error_.message : 'Failed to load node data',
      );
    }

    try {
      const [nextIdentityStatus, nextCloudUrl] = await Promise.all([
        window.service.memeloopNode.getIdentityStatus(),
        window.service.memeloopNode.getCloudUrl(),
      ]);

      setIdentityStatus(nextIdentityStatus);
      if (!cloudUrlDirtyReference.current) {
        setCloudUrlInput(nextCloudUrl ?? nextIdentityStatus.cloudUrl ?? '');
      }
      setCloudStatusError(null);
    } catch (error_) {
      setIdentityStatus(null);
      setCloudStatusError(
        error_ instanceof Error
          ? error_.message
          : 'Failed to load cloud identity status',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const clearCloudFeedback = useCallback(() => {
    setCloudActionError(null);
    setCloudActionSuccess(null);
  }, []);

  const loadCloudNodes = useCallback(async () => {
    setCloudNodesLoading(true);
    setCloudNodesError(null);

    try {
      const nextCloudNodes = await window.service.memeloopNode.listCloudNodes();
      setCloudNodes(nextCloudNodes);
      setCloudNodesLoaded(true);
    } catch (error_) {
      setCloudNodesError(
        error_ instanceof Error ? error_.message : 'Failed to load cloud nodes',
      );
    } finally {
      setCloudNodesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();

    const interval = setInterval(() => {
      void loadData();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [loadData]);

  const handlePairNode = useCallback((nodeId: string) => {
    setPairingNodeId(nodeId);
    setPairingDialogOpen(true);
  }, []);

  const handlePairingConfirm = useCallback(
    async (confirmCode: string) => {
      if (!pairingNodeId) return;

      const result = await window.service.memeloopNode.confirmPeerPin(
        pairingNodeId,
        confirmCode,
      );
      if (result.ok) {
        setPairingDialogOpen(false);
        setPairingNodeId(null);
        await loadData();
      } else {
        throw new Error(result.error ?? 'PIN confirmation failed');
      }
    },
    [pairingNodeId, loadData],
  );

  const handleRevokeNode = useCallback((nodeId: string) => {
    setRevokeNodeId(nodeId);
    setRevokeDialogOpen(true);
  }, []);

  const handleRevokeConfirm = useCallback(async () => {
    if (!revokeNodeId) return;

    await window.service.memeloopNode.removeKnownNode(revokeNodeId);
    setRevokeDialogOpen(false);
    setRevokeNodeId(null);
    await loadData();
  }, [revokeNodeId, loadData]);

  const handleSaveCloudUrl = useCallback(async () => {
    const nextCloudUrl = cloudUrlInput.trim();

    if (!nextCloudUrl) {
      clearCloudFeedback();
      setCloudActionError('Enter a cloud URL before saving.');
      return;
    }

    try {
      setSavingCloudUrl(true);
      clearCloudFeedback();
      await window.service.memeloopNode.setCloudUrl(nextCloudUrl);
      cloudUrlDirtyReference.current = false;
      setCloudNodes([]);
      setCloudNodesLoaded(false);
      setCloudNodesError(null);
      await loadData();
      setCloudActionSuccess('Cloud URL updated.');
    } catch (error_) {
      setCloudActionError(
        error_ instanceof Error ? error_.message : 'Failed to save cloud URL',
      );
    } finally {
      setSavingCloudUrl(false);
    }
  }, [clearCloudFeedback, cloudUrlInput, loadData]);

  const handleCloudLogin = useCallback(async () => {
    const email = cloudEmail.trim();

    if (!email || !cloudPassword) {
      clearCloudFeedback();
      setCloudActionError('Enter both email and password to log in.');
      return;
    }

    try {
      setLoggingIn(true);
      clearCloudFeedback();
      const result = await window.service.memeloopNode.cloudLogin(
        email,
        cloudPassword,
      );

      if (!result.ok) {
        throw new Error(result.error ?? 'Cloud login failed');
      }

      setCloudPassword('');
      await loadData();
      await loadCloudNodes();
      setCloudActionSuccess('Signed in to memeloop cloud.');
    } catch (error_) {
      setCloudActionError(
        error_ instanceof Error ? error_.message : 'Failed to log in to cloud',
      );
    } finally {
      setLoggingIn(false);
    }
  }, [clearCloudFeedback, cloudEmail, cloudPassword, loadCloudNodes, loadData]);

  const handleCloudLogout = useCallback(async () => {
    try {
      setLoggingOut(true);
      clearCloudFeedback();
      await window.service.memeloopNode.cloudLogout();
      setCloudPassword('');
      setCloudNodes([]);
      setCloudNodesLoaded(false);
      setCloudNodesError(null);
      await loadData();
      setCloudActionSuccess('Signed out of memeloop cloud.');
    } catch (error_) {
      setCloudActionError(
        error_ instanceof Error ? error_.message : 'Failed to log out of cloud',
      );
    } finally {
      setLoggingOut(false);
    }
  }, [clearCloudFeedback, loadData]);

  const handleConnectCloudNode = useCallback(
    async (node: ICloudDiscoveredNode) => {
      if (!node.wsUrl) {
        clearCloudFeedback();
        setCloudActionError(
          'This cloud node does not currently expose a WebSocket URL.',
        );
        return;
      }

      try {
        setConnectingNodeId(node.nodeId);
        clearCloudFeedback();
        await window.service.memeloopNode.addPeer(node.wsUrl);
        await loadData();
        await loadCloudNodes();
        setCloudActionSuccess(`Connected to ${node.name}.`);
      } catch (error_) {
        setCloudActionError(
          error_ instanceof Error
            ? error_.message
            : `Failed to connect to ${node.name}`,
        );
      } finally {
        setConnectingNodeId(null);
      }
    },
    [clearCloudFeedback, loadCloudNodes, loadData],
  );

  const nodesWithStatus: NodeWithStatus[] = connectedPeers.map((peer) => {
    const knownEntry = knownNodes.find((k) => k.nodeId === peer.nodeId);
    return {
      ...peer,
      isTrusted: Boolean(knownEntry),
      knownEntry,
    };
  });

  const trustedNodes = nodesWithStatus.filter((n) => n.isTrusted);
  const untrustedNodes = nodesWithStatus.filter((n) => !n.isTrusted);
  const connectedNodeIds = useMemo(
    () => new Set(connectedPeers.map((peer) => peer.nodeId)),
    [connectedPeers],
  );
  const sortedCloudNodes = useMemo(
    () =>
      [...cloudNodes].sort((left, right) => {
        if (left.connectable !== right.connectable) {
          return left.connectable ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      }),
    [cloudNodes],
  );

  return (
    <Container>
      <Helmet>
        <title>Node Management</title>
      </Helmet>

      <Header>
        <Typography variant='h5' component='h1'>
          Node Management
        </Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
          Manage discovered and connected nodes. Your PIN code: <strong>{localPinCode || 'Loading...'}</strong>
        </Typography>
      </Header>

      <Content>
        {loading && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
            }}
          >
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && (
          <>
            <Section>
              <SectionTitle variant='h6'>Cloud Account & Settings</SectionTitle>
              <SectionCard data-testid='node-management-cloud-account'>
                <CardContent>
                  <Typography
                    variant='body2'
                    color='text.secondary'
                    sx={{ mb: 2 }}
                  >
                    Configure the memeloop cloud URL, sign in, and verify this desktop&apos;s cloud identity before connecting discovered nodes.
                  </Typography>

                  {cloudStatusError && (
                    <Alert severity='warning' sx={{ mb: 2 }}>
                      {cloudStatusError}
                    </Alert>
                  )}

                  {cloudActionError && (
                    <Alert severity='error' sx={{ mb: 2 }}>
                      {cloudActionError}
                    </Alert>
                  )}

                  {cloudActionSuccess && (
                    <Alert severity='success' sx={{ mb: 2 }}>
                      {cloudActionSuccess}
                    </Alert>
                  )}

                  <Stack spacing={2}>
                    <CloudActionGrid>
                      <TextField
                        label='Cloud URL'
                        value={cloudUrlInput}
                        onChange={(event) => {
                          cloudUrlDirtyReference.current = true;
                          setCloudUrlInput(event.target.value);
                        }}
                        placeholder='https://api.memeloop.dev'
                        fullWidth
                        slotProps={{
                          htmlInput: {
                            'data-testid': 'node-management-cloud-url-input',
                          },
                        }}
                      />
                      <Button
                        variant='contained'
                        onClick={() => void handleSaveCloudUrl()}
                        disabled={savingCloudUrl || !cloudUrlInput.trim()}
                        data-testid='node-management-cloud-url-save'
                        sx={{ minWidth: 180 }}
                      >
                        {savingCloudUrl ? 'Saving...' : 'Save Cloud URL'}
                      </Button>
                    </CloudActionGrid>

                    {identityStatus && (
                      <>
                        <Stack
                          direction='row'
                          spacing={1}
                          useFlexGap
                          flexWrap='wrap'
                          data-testid='node-management-cloud-identity-status'
                        >
                          <Chip
                            label={identityStatus.hasKeypair
                              ? 'Keypair Ready'
                              : 'Keypair Missing'}
                            color={identityStatus.hasKeypair ? 'success' : 'warning'}
                            size='small'
                          />
                          <Chip
                            label={identityStatus.cloudLoggedIn
                              ? 'Cloud Logged In'
                              : 'Signed Out'}
                            color={identityStatus.cloudLoggedIn
                              ? 'success'
                              : 'default'}
                            size='small'
                          />
                          <Chip
                            label={identityStatus.cloudNodeRegistered
                              ? 'Node Registered'
                              : 'Node Not Registered'}
                            color={identityStatus.cloudNodeRegistered
                              ? 'success'
                              : 'default'}
                            size='small'
                          />
                          <Chip
                            label={`Trusted Nodes: ${identityStatus.knownNodeCount}`}
                            variant='outlined'
                            size='small'
                          />
                        </Stack>
                        <Typography variant='body2' color='text.secondary'>
                          {identityStatus.cloudLoggedIn
                            ? `Signed in as ${identityStatus.cloudEmail ?? 'unknown account'}.`
                            : 'Not signed in to memeloop cloud.'}
                        </Typography>
                      </>
                    )}

                    {!identityStatus?.cloudLoggedIn
                      ? (
                        <CloudLoginGrid>
                          <TextField
                            label='Email'
                            value={cloudEmail}
                            onChange={(event) => {
                              setCloudEmail(event.target.value);
                            }}
                            fullWidth
                            slotProps={{
                              htmlInput: {
                                'data-testid': 'node-management-cloud-email-input',
                              },
                            }}
                          />
                          <TextField
                            label='Password'
                            type='password'
                            value={cloudPassword}
                            onChange={(event) => {
                              setCloudPassword(event.target.value);
                            }}
                            fullWidth
                            slotProps={{
                              htmlInput: {
                                'data-testid': 'node-management-cloud-password-input',
                              },
                            }}
                          />
                          <Button
                            variant='contained'
                            onClick={() => void handleCloudLogin()}
                            disabled={loggingIn || !cloudEmail.trim() || !cloudPassword}
                            data-testid='node-management-cloud-login'
                            sx={{ minWidth: 140 }}
                          >
                            {loggingIn ? 'Logging in...' : 'Log In'}
                          </Button>
                        </CloudLoginGrid>
                      )
                      : (
                        <Box>
                          <Button
                            variant='outlined'
                            onClick={() => void handleCloudLogout()}
                            disabled={loggingOut}
                            data-testid='node-management-cloud-logout'
                          >
                            {loggingOut ? 'Logging out...' : 'Log Out'}
                          </Button>
                        </Box>
                      )}
                  </Stack>
                </CardContent>
              </SectionCard>
            </Section>

            <Section>
              <SectionTitle variant='h6'>
                Cloud Nodes{cloudNodesLoaded ? ` (${cloudNodes.length})` : ''}
              </SectionTitle>
              <SectionCard data-testid='node-management-cloud-nodes'>
                <CardContent>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 2,
                      flexWrap: 'wrap',
                      mb: 2,
                    }}
                  >
                    <Typography
                      variant='body2'
                      color='text.secondary'
                      sx={{ maxWidth: 720 }}
                    >
                      Load cloud-discovered nodes and connect with the exact WebSocket URL resolved by the service contract.
                    </Typography>
                    <Button
                      variant='contained'
                      onClick={() => void loadCloudNodes()}
                      disabled={cloudNodesLoading || !identityStatus?.cloudLoggedIn}
                      data-testid='node-management-cloud-load-nodes'
                    >
                      {cloudNodesLoading
                        ? 'Loading...'
                        : cloudNodesLoaded
                        ? 'Refresh Cloud Nodes'
                        : 'Load Cloud Nodes'}
                    </Button>
                  </Box>

                  {!identityStatus?.cloudLoggedIn && (
                    <Alert severity='info' sx={{ mb: 2 }}>
                      Log in to memeloop cloud before loading cloud-discovered nodes.
                    </Alert>
                  )}

                  {cloudNodesError && (
                    <Alert severity='error' sx={{ mb: 2 }}>
                      {cloudNodesError}
                    </Alert>
                  )}

                  {cloudNodesLoading && (
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        py: 4,
                      }}
                    >
                      <CircularProgress size={28} />
                    </Box>
                  )}

                  {!cloudNodesLoading &&
                    cloudNodesLoaded &&
                    sortedCloudNodes.length === 0 && (
                    <Typography variant='body2' color='text.secondary'>
                      No cloud nodes are available for this account yet.
                    </Typography>
                  )}

                  {!cloudNodesLoading && sortedCloudNodes.length > 0 && (
                    <NodeGrid>
                      {sortedCloudNodes.map((node) => {
                        const testIdSegment = getCloudNodeTestIdSegment(
                          node.nodeId,
                        );
                        const isConnected = connectedNodeIds.has(node.nodeId);
                        const canConnect = Boolean(
                          node.connectable && node.wsUrl && !isConnected,
                        );

                        return (
                          <CloudNodeCard
                            key={node.nodeId}
                            data-testid={`node-management-cloud-node-${testIdSegment}`}
                          >
                            <CardContent sx={{ flex: 1 }}>
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  mb: 1,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <Typography
                                  variant='h6'
                                  component='div'
                                  sx={{ flex: 1 }}
                                >
                                  {node.name}
                                </Typography>
                                <Chip
                                  label={node.connectable
                                    ? 'Connectable'
                                    : 'Unavailable'}
                                  color={node.connectable ? 'success' : 'default'}
                                  size='small'
                                />
                                {isConnected && (
                                  <Chip
                                    label='Connected'
                                    color='primary'
                                    size='small'
                                  />
                                )}
                              </Box>

                              <Typography
                                variant='body2'
                                color='text.secondary'
                                sx={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.75rem',
                                  wordBreak: 'break-all',
                                  mb: 1,
                                }}
                              >
                                {node.nodeId}
                              </Typography>

                              <Stack
                                direction='row'
                                spacing={1}
                                useFlexGap
                                flexWrap='wrap'
                                sx={{ mb: 1.5 }}
                              >
                                <Chip
                                  label={node.status ?? 'unknown'}
                                  size='small'
                                  variant='outlined'
                                />
                                <Chip
                                  label={`Source: ${node.wsUrlSource}`}
                                  size='small'
                                  variant='outlined'
                                />
                              </Stack>

                              <Typography
                                variant='body2'
                                color='text.secondary'
                                sx={{ mb: 0.5 }}
                              >
                                Last seen: {formatLastSeen(node.lastSeen)}
                              </Typography>
                              <Typography
                                variant='body2'
                                color='text.secondary'
                                sx={{ mb: 0.5 }}
                              >
                                Public IP: {node.publicIP ?? 'Unavailable'}
                              </Typography>
                              <Typography
                                variant='body2'
                                color='text.secondary'
                                sx={{ mb: 0.5 }}
                              >
                                FRP Address: {node.frpAddress ?? 'Unavailable'}
                              </Typography>
                              <Typography
                                variant='body2'
                                color='text.secondary'
                                sx={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.75rem',
                                  wordBreak: 'break-all',
                                  mt: 1.5,
                                }}
                              >
                                WS URL: {node.wsUrl ?? 'Unavailable'}
                              </Typography>
                            </CardContent>

                            <Box sx={{ px: 2, pb: 2 }}>
                              <Button
                                fullWidth
                                variant='contained'
                                onClick={() => void handleConnectCloudNode(node)}
                                disabled={connectingNodeId === node.nodeId ||
                                  !canConnect}
                                data-testid={`node-management-cloud-connect-${testIdSegment}`}
                              >
                                {connectingNodeId === node.nodeId
                                  ? 'Connecting...'
                                  : isConnected
                                  ? 'Connected'
                                  : canConnect
                                  ? 'Connect'
                                  : 'Unavailable'}
                              </Button>
                            </Box>
                          </CloudNodeCard>
                        );
                      })}
                    </NodeGrid>
                  )}
                </CardContent>
              </SectionCard>
            </Section>

            {untrustedNodes.length > 0 && (
              <Section>
                <SectionTitle variant='h6'>
                  Discovered Nodes ({untrustedNodes.length})
                </SectionTitle>
                <Typography
                  variant='body2'
                  color='text.secondary'
                  sx={{ mb: 2 }}
                >
                  These nodes are discovered but not yet trusted. Pair them using PIN confirmation.
                </Typography>
                <NodeGrid>
                  {untrustedNodes.map((node) => (
                    <NodeCard
                      key={node.nodeId}
                      node={node}
                      onPair={handlePairNode}
                      onRevoke={undefined}
                    />
                  ))}
                </NodeGrid>
              </Section>
            )}

            {trustedNodes.length > 0 && (
              <Section>
                <SectionTitle variant='h6'>
                  Trusted Nodes ({trustedNodes.length})
                </SectionTitle>
                <Typography
                  variant='body2'
                  color='text.secondary'
                  sx={{ mb: 2 }}
                >
                  These nodes are trusted and can access your resources.
                </Typography>
                <NodeGrid>
                  {trustedNodes.map((node) => (
                    <NodeCard
                      key={node.nodeId}
                      node={node}
                      onPair={undefined}
                      onRevoke={handleRevokeNode}
                    />
                  ))}
                </NodeGrid>
              </Section>
            )}

            {nodesWithStatus.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant='h6' color='text.secondary'>
                  No nodes discovered
                </Typography>
                <Typography
                  variant='body2'
                  color='text.secondary'
                  sx={{ mt: 1 }}
                >
                  Make sure mDNS discovery is enabled and other nodes are running on your network.
                </Typography>
              </Box>
            )}
          </>
        )}
      </Content>

      <PinPairingDialog
        open={pairingDialogOpen}
        nodeId={pairingNodeId ?? ''}
        localPinCode={localPinCode}
        onConfirm={handlePairingConfirm}
        onCancel={() => {
          setPairingDialogOpen(false);
          setPairingNodeId(null);
        }}
      />

      <RevokeDialog
        open={revokeDialogOpen}
        nodeId={revokeNodeId ?? ''}
        onConfirm={handleRevokeConfirm}
        onCancel={() => {
          setRevokeDialogOpen(false);
          setRevokeNodeId(null);
        }}
      />
    </Container>
  );
}
