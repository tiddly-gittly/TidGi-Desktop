import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ImageSearchIcon from '@mui/icons-material/ImageSearch';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizePairingInvitePayload(payload: string): string {
  const normalized = payload.trim();
  if (!normalized) throw new Error('pairing_invite_required');
  return normalized;
}

export function DevicePairingInviteDialog(props: {
  open: boolean;
  payload?: string;
  qrDataUrl?: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{t('DeviceNetwork.InviteTitle')}</DialogTitle>
      <DialogContent>
        <Typography variant='body2' sx={{ mb: 2 }}>{t('DeviceNetwork.InviteDescription')}</Typography>
        {props.qrDataUrl && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <Box
              component='img'
              src={props.qrDataUrl}
              alt={t('DeviceNetwork.InviteQrAlt')}
              sx={{ width: 320, maxWidth: '100%', imageRendering: 'pixelated' }}
            />
          </Box>
        )}
        <TextField
          fullWidth
          multiline
          minRows={3}
          value={props.payload ?? ''}
          slotProps={{ htmlInput: { readOnly: true, 'data-testid': 'device-pairing-invite-payload' } }}
        />
      </DialogContent>
      <DialogActions>
        <Button
          startIcon={<ContentCopyIcon />}
          disabled={!props.payload}
          onClick={() => {
            if (props.payload) void navigator.clipboard.writeText(props.payload);
          }}
        >
          {t('DeviceNetwork.CopyInvite')}
        </Button>
        <Button onClick={props.onClose}>{t('Cancel')}</Button>
      </DialogActions>
    </Dialog>
  );
}

export function DevicePairingScannerDialog(props: {
  busy: boolean;
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: string) => Promise<void>;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [payload, setPayload] = useState('');
  const [scannerError, setScannerError] = useState<string>();
  const [cameraActive, setCameraActive] = useState(false);
  const controls = useRef<IScannerControls | undefined>(undefined);
  const video = useRef<HTMLVideoElement>(null);

  const stopCamera = () => {
    controls.current?.stop();
    controls.current = undefined;
    setCameraActive(false);
  };

  useEffect(() => {
    if (!props.open) {
      stopCamera();
      setPayload('');
      setScannerError(undefined);
    }
    return stopCamera;
  }, [props.open]);

  const startCamera = async () => {
    setScannerError(undefined);
    stopCamera();
    if (!video.current) return;
    try {
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });
      controls.current = await reader.decodeFromVideoDevice(undefined, video.current, result => {
        if (!result) return;
        setPayload(result.getText());
        stopCamera();
      });
      setCameraActive(true);
    } catch (error) {
      setScannerError(message(error));
      stopCamera();
    }
  };

  const scanImage = async (file: File | undefined) => {
    if (!file) return;
    setScannerError(undefined);
    const url = URL.createObjectURL(file);
    try {
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(url);
      setPayload(result.getText());
    } catch (error) {
      setScannerError(message(error));
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{t('DeviceNetwork.ScanInviteTitle')}</DialogTitle>
      <DialogContent>
        <Typography variant='body2' sx={{ mb: 2 }}>{t('DeviceNetwork.ScanInviteDescription')}</Typography>
        {scannerError && <Alert severity='error' sx={{ mb: 2 }}>{scannerError}</Alert>}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Button startIcon={<CameraAltIcon />} onClick={() => void startCamera()}>
            {cameraActive ? t('DeviceNetwork.RestartCamera') : t('DeviceNetwork.StartCamera')}
          </Button>
          <Button component='label' startIcon={<ImageSearchIcon />}>
            {t('DeviceNetwork.ScanImage')}
            <input
              hidden
              type='file'
              accept='image/*'
              onChange={event => void scanImage(event.currentTarget.files?.[0])}
            />
          </Button>
        </Box>
        <Box
          component='video'
          ref={video}
          muted
          playsInline
          sx={{ display: cameraActive ? 'block' : 'none', width: '100%', maxHeight: 320, mb: 2, bgcolor: 'black' }}
        />
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={4}
          label={t('DeviceNetwork.InvitePayload')}
          value={payload}
          onChange={event => {
            setPayload(event.target.value);
          }}
          slotProps={{ htmlInput: { 'data-testid': 'device-pairing-scanner-payload' } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>{t('Cancel')}</Button>
        <Button
          variant='contained'
          disabled={props.busy || payload.trim().length === 0}
          onClick={() => void props.onSubmit(normalizePairingInvitePayload(payload))}
        >
          {t('DeviceNetwork.RequestPairing')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
