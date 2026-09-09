import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ImageSearchIcon from '@mui/icons-material/ImageSearch';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { decodeDevicePairingQrFile, DevicePairingQrCameraScanner, DevicePairingQrScannerError } from './devicePairingQrScanner';

type ScannerErrorKey = 'DeviceNetwork.CameraScanFailed' | 'DeviceNetwork.ImageScanFailed' | 'DeviceNetwork.ScanImageTooLarge';

function imageScannerErrorKey(error: unknown): ScannerErrorKey {
  if (error instanceof DevicePairingQrScannerError && error.code === 'image-too-large') {
    return 'DeviceNetwork.ScanImageTooLarge';
  }
  return 'DeviceNetwork.ImageScanFailed';
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
  const [scannerError, setScannerError] = useState<ScannerErrorKey>();
  const [cameraActive, setCameraActive] = useState(false);
  const cameraScanner = useRef<DevicePairingQrCameraScanner | undefined>(undefined);
  const imageGeneration = useRef(0);
  const video = useRef<HTMLVideoElement>(null);

  const stopCamera = useCallback(() => {
    cameraScanner.current?.dispose();
    cameraScanner.current = undefined;
    setCameraActive(false);
  }, []);

  useEffect(() => {
    if (!props.open) {
      stopCamera();
      imageGeneration.current += 1;
      setPayload('');
      setScannerError(undefined);
    }
    return () => {
      cameraScanner.current?.dispose();
      cameraScanner.current = undefined;
      imageGeneration.current += 1;
    };
  }, [props.open, stopCamera]);

  const startCamera = async () => {
    setScannerError(undefined);
    imageGeneration.current += 1;
    stopCamera();
    if (!video.current) return;
    const scanner = new DevicePairingQrCameraScanner(video.current, {
      onActiveChange: active => {
        if (cameraScanner.current === scanner) setCameraActive(active);
      },
      onError: () => {
        if (cameraScanner.current === scanner) setScannerError('DeviceNetwork.CameraScanFailed');
      },
      onPayload: value => {
        if (cameraScanner.current === scanner) setPayload(value);
      },
    });
    cameraScanner.current = scanner;
    await scanner.start();
  };

  const scanImage = async (file: File | undefined) => {
    if (!file) return;
    setScannerError(undefined);
    stopCamera();
    const generation = ++imageGeneration.current;
    try {
      const result = await decodeDevicePairingQrFile(file);
      if (imageGeneration.current === generation) setPayload(result);
    } catch (error) {
      if (imageGeneration.current === generation) setScannerError(imageScannerErrorKey(error));
    }
  };

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{t('DeviceNetwork.ScanInviteTitle')}</DialogTitle>
      <DialogContent>
        <Typography variant='body2' sx={{ mb: 2 }}>{t('DeviceNetwork.ScanInviteDescription')}</Typography>
        {scannerError && <Alert severity='error' sx={{ mb: 2 }}>{t(scannerError)}</Alert>}
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
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                void scanImage(file);
              }}
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
