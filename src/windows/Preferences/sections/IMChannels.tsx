import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ICustomSectionProps } from '@services/preferences/definitions/types';

const IM_PLATFORMS = ['telegram', 'discord', 'lark', 'wecom'] as const;
type IMPlatform = (typeof IM_PLATFORMS)[number];

interface IMChannelConfig {
  channelId: string;
  platform: IMPlatform;
  botToken: string;
  webhookMode: 'direct' | 'cloud-relay';
  defaultDefinitionId?: string;
  status: 'active' | 'inactive' | 'error';
  // Platform-specific fields
  webhookSecret?: string;
  discordPublicKey?: string;
  larkVerificationToken?: string;
  larkEncryptKey?: string;
  wecomToken?: string;
  wecomEncodingAesKey?: string;
  wecomCorpId?: string;
}

const PLATFORM_LABELS: Record<IMPlatform, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  lark: 'Lark / Feishu',
  wecom: 'WeChat Work',
};

const PLATFORM_FIELDS: Record<IMPlatform, Array<{ key: keyof IMChannelConfig; label: string; required?: boolean; placeholder?: string }>> = {
  telegram: [
    { key: 'botToken', label: 'Bot Token', required: true, placeholder: '123456:ABC-DEF...' },
    { key: 'webhookSecret', label: 'Webhook Secret', placeholder: 'Optional secret for webhook verification' },
  ],
  discord: [
    { key: 'botToken', label: 'Bot Token', required: true, placeholder: 'Application Bot Token' },
    { key: 'discordPublicKey', label: 'Application Public Key', required: true, placeholder: 'Ed25519 public key for signature verification' },
  ],
  lark: [
    { key: 'botToken', label: 'App ID', required: true, placeholder: 'cli_a1234567890' },
    { key: 'larkVerificationToken', label: 'Verification Token', required: true },
    { key: 'larkEncryptKey', label: 'Encrypt Key', placeholder: 'Optional AES encryption key' },
  ],
  wecom: [
    { key: 'botToken', label: 'Corp Bot Token', required: true },
    { key: 'wecomToken', label: 'Callback Token', required: true },
    { key: 'wecomEncodingAesKey', label: 'Encoding AES Key', required: true, placeholder: '43-char Base64 key' },
    { key: 'wecomCorpId', label: 'Corp ID', required: true, placeholder: 'ww1234567890abcd' },
  ],
};

function getStatusColor(status: string): 'success' | 'error' | 'default' {
  switch (status) {
    case 'active':
      return 'success';
    case 'error':
      return 'error';
    default:
      return 'default';
  }
}

function generateChannelId(platform: IMPlatform): string {
  return `${platform}-${Date.now().toString(36)}`;
}

const EMPTY_CHANNEL: IMChannelConfig = {
  channelId: '',
  platform: 'telegram',
  botToken: '',
  webhookMode: 'cloud-relay',
  status: 'inactive',
};

export function IMChannels(_props: ICustomSectionProps): React.JSX.Element {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<IMChannelConfig[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<IMChannelConfig | null>(null);
  const [formData, setFormData] = useState<IMChannelConfig>({ ...EMPTY_CHANNEL });
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      // Load IM channel configs from memeloopNode service
      const status = await window.service.memeloopNode.getServerStatus();
      if (!status.running) {
        setChannels([]);
        return;
      }
      // For now, channels are stored in the node YAML config and loaded at startup.
      // The UI reads them from the node's RPC.
      // TODO: wire to actual memeloopNode.getIMChannels() when available
      setChannels([]);
    } catch {
      setChannels([]);
    }
  }, []);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  const handleAdd = useCallback(() => {
    setEditingChannel(null);
    setFormData({ ...EMPTY_CHANNEL, channelId: generateChannelId('telegram') });
    setError(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((channel: IMChannelConfig) => {
    setEditingChannel(channel);
    setFormData({ ...channel });
    setError(null);
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
    setEditingChannel(null);
    setError(null);
  }, []);

  const handlePlatformChange = useCallback((platform: IMPlatform) => {
    setFormData((prev) => ({
      ...prev,
      platform,
      channelId: editingChannel ? prev.channelId : generateChannelId(platform),
      // Reset platform-specific fields
      webhookSecret: undefined,
      discordPublicKey: undefined,
      larkVerificationToken: undefined,
      larkEncryptKey: undefined,
      wecomToken: undefined,
      wecomEncodingAesKey: undefined,
      wecomCorpId: undefined,
    }));
  }, [editingChannel]);

  const handleFieldChange = useCallback((key: keyof IMChannelConfig, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    // Validate required fields
    const platformFields = PLATFORM_FIELDS[formData.platform];
    for (const field of platformFields) {
      if (field.required && !formData[field.key]) {
        setError(t('IMChannels.RequiredField', { field: field.label }));
        return;
      }
    }

    try {
      if (editingChannel) {
        setChannels((prev) => prev.map((ch) => (ch.channelId === editingChannel.channelId ? { ...formData } : ch)));
      } else {
        setChannels((prev) => [...prev, { ...formData, status: 'inactive' }]);
      }
      // TODO: persist via memeloopNode.saveIMChannel(formData) when available
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [formData, editingChannel, handleClose, t]);

  const handleDelete = useCallback((channelId: string) => {
    setChannels((prev) => prev.filter((ch) => ch.channelId !== channelId));
    setDeleteConfirmId(null);
    // TODO: persist via memeloopNode.deleteIMChannel(channelId) when available
  }, []);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {t('IMChannels.Description')}
        </Typography>
        <Button variant="outlined" startIcon={<AddIcon />} size="small" onClick={handleAdd}>
          {t('IMChannels.AddChannel')}
        </Button>
      </Box>

      {channels.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('IMChannels.NoChannels')}
        </Alert>
      )}

      <Stack spacing={2}>
        {channels.map((channel) => (
          <Card key={channel.channelId} variant="outlined">
            <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="subtitle2">{PLATFORM_LABELS[channel.platform]}</Typography>
                  <Chip label={channel.status.toUpperCase()} color={getStatusColor(channel.status)} size="small" />
                  <Chip label={channel.webhookMode === 'cloud-relay' ? t('IMChannels.CloudRelay') : t('IMChannels.Direct')} size="small" variant="outlined" />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {channel.channelId}
                  {channel.defaultDefinitionId ? ` · ${channel.defaultDefinitionId}` : ''}
                </Typography>
              </Box>
              <Box>
                <IconButton size="small" onClick={() => handleEdit(channel)} title={t('IMChannels.Edit')}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" color="error" onClick={() => setDeleteConfirmId(channel.channelId)} title={t('IMChannels.Delete')}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editingChannel ? t('IMChannels.EditChannel') : t('IMChannels.AddChannel')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <FormControl fullWidth>
              <InputLabel>{t('IMChannels.Platform')}</InputLabel>
              <Select
                value={formData.platform}
                label={t('IMChannels.Platform')}
                onChange={(e) => handlePlatformChange(e.target.value as IMPlatform)}
                disabled={!!editingChannel}
              >
                {IM_PLATFORMS.map((p) => (
                  <MenuItem key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField label={t('IMChannels.ChannelId')} value={formData.channelId} onChange={(e) => handleFieldChange('channelId', e.target.value)} size="small" disabled={!!editingChannel} />

            {/* Platform-specific fields */}
            {PLATFORM_FIELDS[formData.platform].map((field) => (
              <TextField
                key={field.key}
                label={field.label}
                value={(formData[field.key] as string) ?? ''}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                required={field.required}
                placeholder={field.placeholder}
                size="small"
                type={field.key === 'botToken' || field.key === 'wecomEncodingAesKey' ? 'password' : 'text'}
              />
            ))}

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2">{t('IMChannels.WebhookMode')}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('IMChannels.Direct')}
                </Typography>
                <Switch checked={formData.webhookMode === 'cloud-relay'} onChange={(e) => handleFieldChange('webhookMode', e.target.checked ? 'cloud-relay' : 'direct')} />
                <Typography variant="caption" color="text.secondary">
                  {t('IMChannels.CloudRelay')}
                </Typography>
              </Box>
            </Box>

            <TextField label={t('IMChannels.DefaultDefinition')} value={formData.defaultDefinitionId ?? ''} onChange={(e) => handleFieldChange('defaultDefinitionId', e.target.value)} size="small" placeholder={t('IMChannels.DefaultDefinitionPlaceholder')} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>{t('Cancel')}</Button>
          <Button variant="contained" onClick={() => void handleSave()}>
            {editingChannel ? t('IMChannels.Save') : t('IMChannels.Add')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)}>
        <DialogTitle>{t('IMChannels.ConfirmDelete')}</DialogTitle>
        <DialogContent>
          <Typography>{t('IMChannels.ConfirmDeleteDescription')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmId(null)}>{t('Cancel')}</Button>
          <Button color="error" variant="contained" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>
            {t('IMChannels.Delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
