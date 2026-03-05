import AlarmIcon from '@mui/icons-material/Alarm';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import FavoriteIcon from '@mui/icons-material/Favorite';
import SecurityIcon from '@mui/icons-material/Security';
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, List, ListItemButton, Tooltip, Typography } from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';
import { ToolApprovalSettingsDialog } from './ExternalAPI/components/ToolApprovalSettingsDialog';

interface BackgroundTask {
  agentId: string;
  agentName?: string;
  type: 'heartbeat' | 'alarm';
  intervalSeconds?: number;
  wakeAtISO?: string;
  message?: string;
  repeatIntervalMinutes?: number;
}

export function AIAgent(props: ISectionProps): React.JSX.Element {
  const { t } = useTranslation('agent');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toolApprovalDialogOpen, setToolApprovalDialogOpen] = useState(false);
  const [agentInfo, setAgentInfo] = useState<{ exists: boolean; size?: number; path?: string }>({ exists: false });
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);

  const fetchBackgroundTasks = useCallback(async () => {
    try {
      const tasks = await window.service.agentInstance.getBackgroundTasks();
      setBackgroundTasks(tasks);
    } catch {
      // Service may not be ready yet
    }
  }, []);

  useEffect(() => {
    void fetchBackgroundTasks();
  }, [fetchBackgroundTasks]);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const info = await window.service.database.getDatabaseInfo('agent');
        const path = await window.service.database.getDatabasePath('agent');
        setAgentInfo({ ...info, path });
      } catch (error) {
        void window.service.native.log(
          'error',
          'AIAgent: fetch agent database info failed',
          {
            function: 'AIAgent.fetchInfo',
            error,
          },
        );
      }
    };
    void fetchInfo();
  }, []);

  return (
    <>
      <SectionTitle ref={props.sections.aiAgent.ref}>{t('Preference.AIAgent')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          <ListItem>
            <ListItemText
              primary={t('Preference.AIAgentDescription')}
              secondary={t('Preference.AIAgentDescriptionDetail')}
            />
          </ListItem>
          <ListItemButton
            onClick={async () => {
              if (agentInfo.path) {
                try {
                  await window.service.native.openPath(agentInfo.path, true);
                } catch (error) {
                  void window.service.native.log(
                    'error',
                    'AIAgent: open database folder failed',
                    {
                      function: 'AIAgent.openDatabaseFolder',
                      error,
                      path: agentInfo.path,
                    },
                  );
                }
              }
            }}
          >
            <ListItemText
              primary={t('Preference.OpenDatabaseFolder')}
              secondary={agentInfo.path || t('Unknown', { ns: 'translation' })}
            />
            <ChevronRightIcon color='action' />
          </ListItemButton>
          <ListItemButton
            onClick={() => {
              setDeleteDialogOpen(true);
            }}
          >
            <ListItemText
              primary={t('Preference.DeleteAgentDatabase')}
              secondary={t('Preference.AgentDatabaseDescription', {
                size: agentInfo.size ? (agentInfo.size / 1024 / 1024).toFixed(2) + ' MB' : t('Unknown', { ns: 'translation' }),
              })}
            />
          </ListItemButton>
          <ListItemButton
            onClick={() => {
              setToolApprovalDialogOpen(true);
            }}
          >
            <SecurityIcon sx={{ mr: 1 }} color='action' />
            <ListItemText
              primary='Tool Approval & Timeout Settings'
              secondary='Configure per-tool approval rules, timeout limits, regex patterns, and API retry settings'
            />
            <ChevronRightIcon color='action' />
          </ListItemButton>
        </List>
      </Paper>

      {/* Background Tasks — Scheduled auto-wake tasks */}
      <SectionTitle>{t('Preference.BackgroundTasks')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          <ListItem>
            <ListItemText
              primary={t('Preference.BackgroundTasksDescription')}
            />
            <Button
              size='small'
              onClick={() => {
                void fetchBackgroundTasks();
              }}
            >
              {t('Refresh')}
            </Button>
          </ListItem>
          {backgroundTasks.length === 0 && (
            <ListItem>
              <Typography variant='body2' color='text.secondary' sx={{ py: 1 }}>
                {t('Preference.NoBackgroundTasks')}
              </Typography>
            </ListItem>
          )}
          {backgroundTasks.map((task) => (
            <ListItem key={`${task.agentId}-${task.type}`}>
              <Chip
                icon={task.type === 'heartbeat' ? <FavoriteIcon /> : <AlarmIcon />}
                label={task.type === 'heartbeat' ? 'Heartbeat' : 'Alarm'}
                size='small'
                color={task.type === 'heartbeat' ? 'success' : 'warning'}
                variant='outlined'
                sx={{ mr: 1 }}
              />
              <ListItemText
                primary={task.agentName ?? task.agentId}
                secondary={task.type === 'heartbeat'
                  ? `Every ${task.intervalSeconds ?? '?'}s — ${task.message ?? ''}`
                  : `${task.wakeAtISO ?? '?'}${task.repeatIntervalMinutes ? ` (repeat every ${task.repeatIntervalMinutes}min)` : ''} — ${task.message ?? ''}`}
              />
              <Tooltip title={t('Preference.CancelTask')}>
                <IconButton
                  size='small'
                  onClick={async () => {
                    await window.service.agentInstance.cancelBackgroundTask(task.agentId, task.type);
                    void fetchBackgroundTasks();
                  }}
                  data-testid={`cancel-bg-task-${task.agentId}-${task.type}`}
                >
                  <DeleteIcon fontSize='small' />
                </IconButton>
              </Tooltip>
            </ListItem>
          ))}
        </List>
      </Paper>

      <ToolApprovalSettingsDialog
        open={toolApprovalDialogOpen}
        onClose={() => {
          setToolApprovalDialogOpen(false);
        }}
      />

      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
        }}
      >
        <DialogTitle>{t('Preference.ConfirmDelete')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('Preference.ConfirmDeleteAgentDatabase')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteDialogOpen(false);
            }}
          >
            {t('Cancel')}
          </Button>
          <Button
            onClick={async () => {
              try {
                await window.service.database.deleteDatabase('agent');
                setDeleteDialogOpen(false);
                // Refresh info after deletion
                const info = await window.service.database.getDatabaseInfo('agent');
                const path = await window.service.database.getDatabasePath('agent');
                setAgentInfo({ ...info, path });
              } catch (error) {
                void window.service.native.log(
                  'error',
                  'AIAgent: delete agent database failed',
                  {
                    function: 'AIAgent.handleDelete',
                    error,
                  },
                );
              }
            }}
            color='error'
          >
            {t('Delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
