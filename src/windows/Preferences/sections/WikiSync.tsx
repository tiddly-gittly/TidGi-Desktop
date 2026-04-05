import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import CloudOffIcon from '@mui/icons-material/CloudOff';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import FolderIcon from '@mui/icons-material/Folder';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncIcon from '@mui/icons-material/Sync';
import AddLinkIcon from '@mui/icons-material/AddLink';
import CloudIcon from '@mui/icons-material/Cloud';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import DeleteIcon from '@mui/icons-material/Delete';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  List,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

import { ListItem, ListItemText } from '@/components/ListItem';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import type { IConnectedPeer, IRemoteWiki, NodeIdentityStatus } from '@services/memeloopNode/interface';
import type { KnownNodeEntry } from '@memeloop/protocol';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { Paper, SectionTitle } from '../PreferenceComponents';

export function WikiSync(props: ICustomSectionProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      <SectionTitle ref={props.sectionRef}>{t('Preference.WikiSync')}</SectionTitle>

      <NodeStatusBanner />
      <IdentityPanel />
      <CloudAuthPanel />
      <KnownNodesPanel />
      <SyncStatusPanel />
      <AddPeerPanel />
      <LocalWikiList />
      <RemoteWikiList />
    </>
  );
}

function NodeStatusBanner(): React.JSX.Element {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{ running: boolean; port?: number; nodeId?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.service.memeloopNode.getServerStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => { cancelled = true; };
  }, []);

  if (status === null) return <CircularProgress size={20} sx={{ m: 2 }} />;

  if (!status.running) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        {t('Preference.WikiSync.NodeNotRunning')}
      </Alert>
    );
  }

  return (
    <Alert severity="info" sx={{ mb: 2 }} icon={<SyncIcon />}>
      {t('Preference.WikiSync.NodeRunning', { port: status.port, nodeId: status.nodeId?.slice(0, 16) })}
    </Alert>
  );
}

function LocalWikiList(): React.JSX.Element {
  const { t } = useTranslation();
  const workspaces = useWorkspacesListObservable();
  const [registeredIds, setRegisteredIds] = useState<string[]>([]);

  useEffect(() => {
    void window.service.memeloopNode.getRegisteredWikis().then(setRegisteredIds);
  }, []);

  const wikiWorkspaces = workspaces?.filter((w) => isWikiWorkspace(w) && !w.isSubWiki) ?? [];

  return (
    <>
      <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>
        <FolderIcon sx={{ verticalAlign: 'middle', mr: 0.5, fontSize: '1.2em' }} />
        {t('Preference.WikiSync.LocalWikis')}
      </Typography>
      <Paper elevation={0}>
        <List dense disablePadding>
          {wikiWorkspaces.length === 0
            ? (
              <ListItem>
                <ListItemText primary={t('Preference.WikiSync.NoLocalWikis')} />
              </ListItem>
              )
            : wikiWorkspaces.map((ws) => {
                const registered = registeredIds.includes(ws.id);
                return (
                  <Box key={ws.id}>
                    <ListItem
                      secondaryAction={
                        registered
                          ? <Chip label={t('Preference.WikiSync.MobileSyncActive')} color="success" size="small" variant="outlined" />
                          : <Chip label={t('Preference.WikiSync.MobileSyncInactive')} size="small" variant="outlined" />
                      }
                    >
                      <ListItemText
                        primary={ws.name || ws.id}
                        secondary={isWikiWorkspace(ws) ? ws.wikiFolderLocation : undefined}
                      />
                    </ListItem>
                    <Divider component="li" />
                  </Box>
                );
              })}
        </List>
      </Paper>
    </>
  );
}

function IdentityPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [identity, setIdentity] = useState<NodeIdentityStatus | null>(null);
  const [pinCode, setPinCode] = useState<string | null>(null);

  useEffect(() => {
    void window.service.memeloopNode.getIdentityStatus().then(setIdentity);
    void window.service.memeloopNode.getLocalPinCode().then(setPinCode).catch(() => setPinCode(null));
  }, []);

  if (!identity) return <CircularProgress size={16} sx={{ m: 1 }} />;

  return (
    <Paper elevation={0} sx={{ p: 1.5, mb: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        <FingerprintIcon sx={{ verticalAlign: 'middle', mr: 0.5, fontSize: '1.2em' }} />
        {t('Preference.WikiSync.Identity')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography variant="body2">
          {t('Preference.WikiSync.NodeId')}: <code>{identity.nodeId.slice(0, 24)}…</code>
        </Typography>
        {pinCode && (
          <Typography variant="body2">
            {t('Preference.WikiSync.PinCode')}: <strong>{pinCode}</strong>
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
          {identity.hasKeypair
            ? <Chip icon={<VpnKeyIcon />} label={t('Preference.WikiSync.KeypairReady')} color="success" size="small" variant="outlined" />
            : <Chip label={t('Preference.WikiSync.NoKeypair')} color="warning" size="small" variant="outlined" />}
          <Chip label={t('Preference.WikiSync.KnownNodeCount', { count: identity.knownNodeCount })} size="small" variant="outlined" />
        </Box>
      </Box>
    </Paper>
  );
}

function CloudAuthPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [identity, setIdentity] = useState<NodeIdentityStatus | null>(null);
  const [cloudUrl, setCloudUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const id = await window.service.memeloopNode.getIdentityStatus();
    setIdentity(id);
    const url = await window.service.memeloopNode.getCloudUrl();
    if (url) setCloudUrl(url);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleSetCloudUrl = useCallback(async () => {
    if (!cloudUrl.trim()) return;
    setError(null);
    await window.service.memeloopNode.setCloudUrl(cloudUrl.trim());
    await refresh();
  }, [cloudUrl, refresh]);

  const handleLogin = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.service.memeloopNode.cloudLogin(email, password);
      if (!result.ok) setError(result.error ?? 'Login failed');
      else { setPassword(''); await refresh(); }
    } finally { setLoading(false); }
  }, [email, password, refresh]);

  const handleLogout = useCallback(async () => {
    await window.service.memeloopNode.cloudLogout();
    await refresh();
  }, [refresh]);

  const handleRequestOtp = useCallback(async () => {
    setError(null);
    try {
      const result = await window.service.memeloopNode.requestNodeOtp();
      setOtp(result.otp);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleRegisterNode = useCallback(async () => {
    if (!otp) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.service.memeloopNode.registerNodeWithOtp(otp);
      if (result.error) setError(result.error);
      else { setOtp(null); await refresh(); }
    } finally { setLoading(false); }
  }, [otp, refresh]);

  return (
    <Paper elevation={0} sx={{ p: 1.5, mb: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        <CloudIcon sx={{ verticalAlign: 'middle', mr: 0.5, fontSize: '1.2em' }} />
        {t('Preference.WikiSync.CloudAuth')}
      </Typography>

      {/* Cloud URL */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start' }}>
        <TextField
          size="small"
          label={t('Preference.WikiSync.CloudUrl')}
          placeholder="https://api.memeloop.dev"
          value={cloudUrl}
          onChange={(e) => setCloudUrl(e.target.value)}
          fullWidth
        />
        <Button size="small" variant="outlined" onClick={handleSetCloudUrl} sx={{ minWidth: 60 }}>
          {t('Preference.WikiSync.Save')}
        </Button>
      </Box>

      {identity?.cloudLoggedIn
        ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Chip label={identity.cloudEmail ?? 'Logged in'} color="success" size="small" />
            {identity.cloudNodeRegistered && <Chip label={t('Preference.WikiSync.NodeRegistered')} size="small" variant="outlined" color="info" />}
            <Button size="small" startIcon={<LogoutIcon />} onClick={handleLogout}>
              {t('Preference.WikiSync.Logout')}
            </Button>
          </Box>
          )
        : (
          <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start' }}>
            <TextField size="small" label={t('Preference.WikiSync.Email')} value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField size="small" label={t('Preference.WikiSync.Password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button size="small" variant="contained" startIcon={loading ? <CircularProgress size={14} /> : <LoginIcon />} onClick={handleLogin} disabled={loading || !email || !password}>
              {t('Preference.WikiSync.Login')}
            </Button>
          </Box>
          )}

      {/* Node OTP registration */}
      {identity?.cloudLoggedIn && !identity.cloudNodeRegistered && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button size="small" variant="outlined" onClick={handleRequestOtp}>
            {t('Preference.WikiSync.RequestOtp')}
          </Button>
          {otp && (
            <>
              <Typography variant="body2">{t('Preference.WikiSync.OtpCode')}: <strong>{otp}</strong></Typography>
              <Button size="small" variant="contained" onClick={handleRegisterNode} disabled={loading}>
                {t('Preference.WikiSync.RegisterNode')}
              </Button>
            </>
          )}
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    </Paper>
  );
}

function KnownNodesPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState<KnownNodeEntry[]>([]);

  const refresh = useCallback(async () => {
    const n = await window.service.memeloopNode.getKnownNodes();
    setNodes(n);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleRemove = useCallback(async (nodeId: string) => {
    await window.service.memeloopNode.removeKnownNode(nodeId);
    await refresh();
  }, [refresh]);

  if (nodes.length === 0) return <></>;

  return (
    <Paper elevation={0} sx={{ p: 1.5, mb: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        <VpnKeyIcon sx={{ verticalAlign: 'middle', mr: 0.5, fontSize: '1.2em' }} />
        {t('Preference.WikiSync.KnownNodes')}
      </Typography>
      <List dense disablePadding>
        {nodes.map((node) => (
          <Box key={node.nodeId}>
            <ListItem
              secondaryAction={
                <Tooltip title={t('Preference.WikiSync.RemoveTrust')}>
                  <IconButton size="small" onClick={() => handleRemove(node.nodeId)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              }
            >
              <ListItemText
                primary={node.name ?? node.nodeId.slice(0, 16)}
                secondary={`${node.trustSource} · ${new Date(node.lastConnected).toLocaleDateString()}`}
              />
            </ListItem>
            <Divider component="li" />
          </Box>
        ))}
      </List>
    </Paper>
  );
}

function SyncStatusPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [syncStatus, setSyncStatus] = useState<{ versionVector: Record<string, number>; peerCount: number; syncRunning: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refreshStatus = useCallback(async () => {
    const s = await window.service.memeloopNode.getSyncStatus();
    setSyncStatus(s);
  }, []);

  useEffect(() => {
    void refreshStatus();
    const id = setInterval(() => void refreshStatus(), 10_000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await window.service.memeloopNode.syncNow();
      await refreshStatus();
    } finally {
      setSyncing(false);
    }
  }, [refreshStatus]);

  if (!syncStatus) return <CircularProgress size={16} sx={{ m: 1 }} />;

  return (
    <Paper elevation={0} sx={{ p: 1.5, mb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2">
            {t('Preference.WikiSync.PeerCount', { count: syncStatus.peerCount })}
            {syncStatus.syncRunning && (
              <Chip label={t('Preference.WikiSync.SyncActive')} color="success" size="small" variant="outlined" sx={{ ml: 1 }} />
            )}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={syncing ? <CircularProgress size={14} /> : <SyncIcon />}
          onClick={handleSyncNow}
          disabled={syncing}
        >
          {t('Preference.WikiSync.SyncNowButton')}
        </Button>
      </Box>
    </Paper>
  );
}

function AddPeerPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(async () => {
    if (!url.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      await window.service.memeloopNode.addPeer(url.trim());
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }, [url]);

  return (
    <Paper elevation={0} sx={{ p: 1.5, mb: 1 }}>
      <Typography variant="body2" sx={{ mb: 1 }}>
        <AddLinkIcon sx={{ verticalAlign: 'middle', mr: 0.5, fontSize: '1.2em' }} />
        {t('Preference.WikiSync.AddPeer')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          size="small"
          placeholder="ws://192.168.1.100:9000"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null); }}
          fullWidth
          error={!!error}
          helperText={error}
        />
        <Button
          size="small"
          variant="contained"
          onClick={handleAdd}
          disabled={connecting || !url.trim()}
          sx={{ minWidth: 80 }}
        >
          {connecting ? <CircularProgress size={16} /> : t('Preference.WikiSync.Connect')}
        </Button>
      </Box>
    </Paper>
  );
}

function RemoteWikiList(): React.JSX.Element {
  const { t } = useTranslation();
  const [peers, setPeers] = useState<IConnectedPeer[]>([]);
  const [remoteWikis, setRemoteWikis] = useState<IRemoteWiki[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [p, w] = await Promise.all([
        window.service.memeloopNode.getConnectedPeers(),
        window.service.memeloopNode.listAllRemoteWikis(),
      ]);
      setPeers(p);
      setRemoteWikis(w);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', mt: 2, mb: 0.5 }}>
        <Typography variant="subtitle2">
          <DesktopWindowsIcon sx={{ verticalAlign: 'middle', mr: 0.5, fontSize: '1.2em' }} />
          {t('Preference.WikiSync.RemoteNodes')}
          {peers.length > 0 && ` (${peers.length})`}
        </Typography>
        <Tooltip title={t('Preference.WikiSync.Refresh')}>
          <IconButton size="small" onClick={refresh} disabled={loading} sx={{ ml: 1 }}>
            {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      <Paper elevation={0}>
        <List dense disablePadding>
          {peers.length === 0
            ? (
              <ListItem>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CloudOffIcon fontSize="small" color="disabled" />
                      {t('Preference.WikiSync.NoPeersConnected')}
                    </Box>
                  }
                  secondary={t('Preference.WikiSync.NoPeersDescription')}
                />
              </ListItem>
              )
            : (
              <>
                {/* Group remote wikis by node */}
                {peers.map((peer) => {
                  const nodeWikis = remoteWikis.filter((w) => w.nodeId === peer.nodeId);
                  return (
                    <Box key={peer.nodeId}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {peer.name}
                              <Chip
                                label={peer.status}
                                size="small"
                                color={peer.status === 'online' ? 'success' : 'default'}
                                variant="outlined"
                              />
                              <Chip label={peer.type} size="small" variant="outlined" />
                            </Box>
                          }
                          secondary={`Node: ${peer.nodeId.slice(0, 16)}…`}
                        />
                      </ListItem>
                      {nodeWikis.length > 0 && nodeWikis.map((wiki) => (
                        <ListItem key={wiki.wikiId} sx={{ pl: 4 }}>
                          <ListItemText
                            primary={wiki.title ?? wiki.wikiId}
                          />
                        </ListItem>
                      ))}
                      <Divider component="li" />
                    </Box>
                  );
                })}
              </>
              )}
        </List>
      </Paper>
    </>
  );
}
