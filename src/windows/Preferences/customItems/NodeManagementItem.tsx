import AddLinkIcon from '@mui/icons-material/AddLink';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import DeleteIcon from '@mui/icons-material/Delete';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncIcon from '@mui/icons-material/Sync';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import type { KnownNodeEntry } from '@memeloop/protocol';
import type { IConnectedPeer, IRemoteWiki, NodeIdentityStatus } from '@services/memeloopNode/interface';
import type { ICustomItemProps } from '@services/preferences/definitions/types';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Paper, TextField } from '../PreferenceComponents';

export function NodeManagementItem(_props: ICustomItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{ running: boolean; port?: number; nodeId?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.service.memeloopNode.getServerStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box sx={{ mt: 1 }}>
      {status === null
        ? <CircularProgress size={20} sx={{ m: 2 }} />
        : status.running
        ? (
          <Alert severity='info' sx={{ mb: 1 }} icon={<SyncIcon />}>
            {t('Preference.WikiSync.NodeRunning', { port: status.port, nodeId: status.nodeId?.slice(0, 16) })}
          </Alert>
        )
        : (
          <Alert severity='warning' sx={{ mb: 1 }}>
            {t('Preference.WikiSync.NodeNotRunning')}
          </Alert>
        )}

      <IdentityPanel />
      <KnownNodesPanel />
      <SyncStatusPanel />
      <AddPeerPanel />
      <RemoteWikiList />
    </Box>
  );
}

function IdentityPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [identity, setIdentity] = useState<NodeIdentityStatus | null>(null);
  const [pinCode, setPinCode] = useState<string | null>(null);

  useEffect(() => {
    void window.service.memeloopNode.getIdentityStatus().then(setIdentity);
    void window.service.memeloopNode.getLocalPinCode().then(setPinCode).catch(() => {
      setPinCode(null);
    });
  }, []);

  if (!identity) return <CircularProgress size={16} sx={{ m: 1 }} />;

  return (
    <Paper elevation={0} sx={{ p: 1.5, mb: 1 }}>
      <Typography variant='subtitle2' sx={{ mb: 1 }}>
        <FingerprintIcon sx={{ verticalAlign: 'middle', mr: 0.5, fontSize: '1.2em' }} />
        {t('Preference.WikiSync.Identity')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography variant='body2'>
          {t('Preference.WikiSync.NodeId')}: <code>{identity.nodeId.slice(0, 24)}…</code>
        </Typography>
        {pinCode && (
          <Typography variant='body2'>
            {t('Preference.WikiSync.PinCode')}: <strong>{pinCode}</strong>
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
          {identity.hasKeypair
            ? <Chip icon={<VpnKeyIcon />} label={t('Preference.WikiSync.KeypairReady')} color='success' size='small' variant='outlined' />
            : <Chip label={t('Preference.WikiSync.NoKeypair')} color='warning' size='small' variant='outlined' />}
          <Chip label={t('Preference.WikiSync.KnownNodeCount', { count: identity.knownNodeCount })} size='small' variant='outlined' />
        </Box>
      </Box>
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRemove = useCallback(async (nodeId: string) => {
    await window.service.memeloopNode.removeKnownNode(nodeId);
    await refresh();
  }, [refresh]);

  if (nodes.length === 0) return <></>;

  return (
    <Paper elevation={0} sx={{ p: 1.5, mb: 1 }}>
      <Typography variant='subtitle2' sx={{ mb: 0.5 }}>
        <VpnKeyIcon sx={{ verticalAlign: 'middle', mr: 0.5, fontSize: '1.2em' }} />
        {t('Preference.WikiSync.KnownNodes')}
      </Typography>
      <List dense disablePadding>
        {nodes.map((node) => (
          <Box key={node.nodeId}>
            <ListItem
              secondaryAction={
                <Tooltip title={t('Preference.WikiSync.RemoveTrust')}>
                  <IconButton size='small' onClick={() => { void handleRemove(node.nodeId); }}>
                    <DeleteIcon fontSize='small' />
                  </IconButton>
                </Tooltip>
              }
            >
              <ListItemText
                primary={node.name ?? node.nodeId.slice(0, 16)}
                secondary={`${node.trustSource} · ${new Date(node.lastConnected).toLocaleDateString()}`}
              />
            </ListItem>
            <Divider component='li' />
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
    const id = setInterval(() => { void refreshStatus(); }, 10_000);
    return () => {
      clearInterval(id);
    };
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
          <Typography variant='body2'>
            {t('Preference.WikiSync.PeerCount', { count: syncStatus.peerCount })}
            {syncStatus.syncRunning && <Chip label={t('Preference.WikiSync.SyncActive')} color='success' size='small' variant='outlined' sx={{ ml: 1 }} />}
          </Typography>
        </Box>
        <Button
          size='small'
          variant='outlined'
          startIcon={syncing ? <CircularProgress size={14} /> : <SyncIcon />}
          onClick={() => { void handleSyncNow(); }}
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
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
    } finally {
      setConnecting(false);
    }
  }, [url]);

  return (
    <Paper elevation={0} sx={{ p: 1.5, mb: 1 }}>
      <Typography variant='body2' sx={{ mb: 1 }}>
        <AddLinkIcon sx={{ verticalAlign: 'middle', mr: 0.5, fontSize: '1.2em' }} />
        {t('Preference.WikiSync.AddPeer')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          size='small'
          placeholder='ws://192.168.1.100:9000'
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setError(null);
          }}
          fullWidth
          error={!!error}
          helperText={error ?? undefined}
        />
        <Button
          size='small'
          variant='contained'
          onClick={() => { void handleAdd(); }}
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
      <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, mb: 0.5 }}>
        <Typography variant='subtitle2'>
          <DesktopWindowsIcon sx={{ verticalAlign: 'middle', mr: 0.5, fontSize: '1.2em' }} />
          {t('Preference.WikiSync.RemoteNodes')}
          {peers.length > 0 && ` (${peers.length})`}
        </Typography>
        <Tooltip title={t('Preference.WikiSync.Refresh')}>
          <IconButton size='small' onClick={() => { void refresh(); }} disabled={loading} sx={{ ml: 1 }}>
            {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize='small' />}
          </IconButton>
        </Tooltip>
      </Box>
      <Paper elevation={0} sx={{ mb: 2 }}>
        <List dense disablePadding>
          {peers.length === 0
            ? (
              <ListItem>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CloudOffIcon fontSize='small' color='disabled' />
                      <span>{t('Preference.WikiSync.NoPeers')}</span>
                    </Box>
                  }
                />
              </ListItem>
            )
            : peers.map((peer) => {
              const wikis = remoteWikis.filter((w) => w.nodeId === peer.nodeId);
              return (
                <Box key={peer.nodeId}>
                  <ListItem>
                    <ListItemText
                      primary={peer.name ?? peer.nodeId.slice(0, 16)}
                      secondary={`${wikis.length} wiki(s)`}
                    />
                  </ListItem>
                  <Divider component='li' />
                </Box>
              );
            })}
        </List>
      </Paper>
    </>
  );
}
