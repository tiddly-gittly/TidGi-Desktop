import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncIcon from '@mui/icons-material/Sync';
import { Alert, Box, Button, Chip, Divider, IconButton, Tooltip, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import type { Device, PairingSession } from '@services/deviceNetwork/interface';
import useObservable from 'beautiful-react-hooks/useObservable';

function shortPeerId(peerId: string): string {
  if (peerId.length <= 18) return peerId;
  return `${peerId.slice(0, 10)}...${peerId.slice(-6)}`;
}

function formatConfirmCode(code: string): string {
  if (code.length !== 6) return code;
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function DeviceNetworkPanelItem(): React.JSX.Element {
  const { t } = useTranslation();
  const [localDevice, setLocalDevice] = useState<Device | undefined>();
  const [devices, setDevices] = useState<Device[]>([]);
  const [pairingSessions, setPairingSessions] = useState<PairingSession[]>([]);
  const [busyAction, setBusyAction] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const pendingSessions = useMemo(() => pairingSessions.filter(session => session.status === 'pending'), [pairingSessions]);
  const pendingPeerIds = useMemo(() => new Set(pendingSessions.map(session => session.remotePeerId)), [pendingSessions]);

  const refreshSnapshot = async () => {
    await window.service.deviceNetwork.start();
    const [nextLocalDevice, nextDevices, nextPairingSessions] = await Promise.all([
      window.service.deviceNetwork.getLocalDevice(),
      window.service.deviceNetwork.listDevices(),
      window.service.deviceNetwork.listPairingSessions(),
    ]);
    setLocalDevice(nextLocalDevice);
    setDevices(nextDevices);
    setPairingSessions(nextPairingSessions);
  };

  useObservable(window.observables.deviceNetwork.devices$, setDevices);
  useObservable(window.observables.deviceNetwork.pairingSessions$, setPairingSessions);

  useEffect(() => {
    void refreshSnapshot().catch((refreshError: unknown) => {
      setError(errorMessage(refreshError));
    });
  }, []);

  const runAction = async (actionKey: string, action: () => Promise<void>) => {
    setBusyAction(actionKey);
    setError(undefined);
    try {
      await action();
      await refreshSnapshot();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusyAction(undefined);
    }
  };

  return (
    <>
      <ListItem>
        <ListItemText
          primary={t('DeviceNetwork.LocalDevice')}
          secondary={localDevice
            ? `${localDevice.displayName} · ${localDevice.platform} · ${shortPeerId(localDevice.peerId)}`
            : t('Loading')}
        />
        <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, alignItems: 'center' }}>
          <Tooltip title={t('DeviceNetwork.Refresh')}>
            <IconButton
              size='small'
              onClick={() => {
                void runAction('refresh', refreshSnapshot);
              }}
              disabled={busyAction !== undefined}
            >
              <RefreshIcon fontSize='small' />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('DeviceNetwork.SyncCloudDevices')}>
            <IconButton
              size='small'
              onClick={() => {
                void runAction('cloud-sync', async () => {
                  if (!window.service.deviceNetwork.syncCloudDevices) throw new Error('cloud_not_configured');
                  await window.service.deviceNetwork.syncCloudDevices();
                });
              }}
              disabled={busyAction !== undefined}
            >
              <CloudSyncIcon fontSize='small' />
            </IconButton>
          </Tooltip>
        </Box>
      </ListItem>
      {error && (
        <ListItem>
          <Alert severity='warning' sx={{ width: '100%' }}>{error}</Alert>
        </ListItem>
      )}
      <Divider />
      <ListItem>
        <ListItemText primary={t('DeviceNetwork.PairingRequests')} />
      </ListItem>
      {pendingSessions.length === 0
        ? (
          <ListItem>
            <ListItemText secondary={t('DeviceNetwork.NoPendingPairing')} />
          </ListItem>
        )
        : pendingSessions.map(session => (
          <ListItem key={session.sessionId} alignItems='flex-start'>
            <ListItemText
              primary={`${session.remoteDeviceName} · ${t(`DeviceNetwork.Direction.${session.direction}`)}`}
              secondary={
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 0.5 }}>
                  <Typography variant='body2' component='span'>{shortPeerId(session.remotePeerId)}</Typography>
                  <Typography variant='h6' component='span' sx={{ fontFamily: 'monospace', letterSpacing: 0 }}>
                    {formatConfirmCode(session.confirmCode)}
                  </Typography>
                </Box>
              }
            />
            <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, alignItems: 'center' }}>
              <Button
                size='small'
                variant='contained'
                startIcon={<CheckCircleIcon />}
                onClick={() => {
                  void runAction(`accept-${session.sessionId}`, async () => {
                    await window.service.deviceNetwork.acceptPairing(session.sessionId);
                  });
                }}
                disabled={busyAction !== undefined}
              >
                {t('DeviceNetwork.AcceptPairing')}
              </Button>
              <Button
                size='small'
                variant='outlined'
                onClick={() => {
                  void runAction(`reject-${session.sessionId}`, async () => {
                    await window.service.deviceNetwork.rejectPairing(session.sessionId);
                  });
                }}
                disabled={busyAction !== undefined}
              >
                {t('DeviceNetwork.RejectPairing')}
              </Button>
            </Box>
          </ListItem>
        ))}
      <Divider />
      <ListItem>
        <ListItemText primary={t('DeviceNetwork.Devices')} secondary={t('DeviceNetwork.DevicesDescription')} />
      </ListItem>
      {devices.length === 0
        ? (
          <ListItem>
            <ListItemText secondary={t('DeviceNetwork.NoDevices')} />
          </ListItem>
        )
        : devices.map(device => {
          const isPending = pendingPeerIds.has(device.peerId);
          const canPair = device.trustMode === 'local-pairing' && device.trusted !== true && device.reachability.state !== 'offline' && !isPending;
          return (
            <ListItem key={device.peerId} alignItems='flex-start'>
              <ListItemText
                primary={device.displayName}
                secondary={
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 0.5 }}>
                    <Typography variant='body2' component='span'>{shortPeerId(device.peerId)}</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'row', gap: 0.75, flexWrap: 'wrap' }}>
                      <Chip size='small' label={device.platform} />
                      <Chip size='small' label={t(`DeviceNetwork.Reachability.${device.reachability.state}`)} />
                      <Chip size='small' label={t(`DeviceNetwork.TrustMode.${device.trustMode}`)} color={device.trustMode === 'cloud-account' ? 'primary' : 'default'} />
                      {device.trusted === true && <Chip size='small' label={t('DeviceNetwork.Trusted')} color='success' />}
                    </Box>
                  </Box>
                }
              />
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {canPair && (
                  <Button
                    size='small'
                    variant='contained'
                    startIcon={<LinkIcon />}
                    onClick={() => {
                      void runAction(`pair-${device.peerId}`, async () => {
                        await window.service.deviceNetwork.requestLocalPairing(device.peerId, { multiaddrs: device.multiaddrs });
                      });
                    }}
                    disabled={busyAction !== undefined}
                  >
                    {t('DeviceNetwork.Pair')}
                  </Button>
                )}
                {device.trusted === true && (
                  <Button
                    size='small'
                    variant='outlined'
                    startIcon={<SyncIcon />}
                    onClick={() => {
                      void runAction(`sync-${device.peerId}`, async () => {
                        await window.service.deviceNetwork.syncWithDevice(device.peerId);
                      });
                    }}
                    disabled={busyAction !== undefined}
                  >
                    {t('DeviceNetwork.Sync')}
                  </Button>
                )}
                {device.trustMode === 'local-pairing' && device.trusted === true && (
                  <Tooltip title={t('DeviceNetwork.RemoveTrustedDevice')}>
                    <IconButton
                      size='small'
                      onClick={() => {
                        if (!window.confirm(t('DeviceNetwork.RemoveTrustedDeviceConfirm', { deviceName: device.displayName }))) return;
                        void runAction(`remove-${device.peerId}`, async () => {
                          await window.service.deviceNetwork.removeTrustedDevice(device.peerId);
                        });
                      }}
                      disabled={busyAction !== undefined}
                    >
                      <DeleteIcon fontSize='small' />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </ListItem>
          );
        })}
    </>
  );
}
