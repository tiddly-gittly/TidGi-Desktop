import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AddIcon from '@mui/icons-material/Add';
import AlarmIcon from '@mui/icons-material/Alarm';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FavoriteIcon from '@mui/icons-material/Favorite';
import SecurityIcon from '@mui/icons-material/Security';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  MenuItem,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import type { CreateScheduledTaskInput, ScheduledTask } from '@/services/agentInstance/scheduledTaskManager';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import { Paper, SectionTitle } from '../PreferenceComponents';
import { ToolApprovalSettingsDialog } from './ExternalAPI/components/ToolApprovalSettingsDialog';

export function AIAgent(props: ICustomSectionProps): React.JSX.Element {
  const { t } = useTranslation('agent');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toolApprovalDialogOpen, setToolApprovalDialogOpen] = useState(false);
  const [agentInfo, setAgentInfo] = useState<{ exists: boolean; size?: number; path?: string }>({ exists: false });
  const [agentOptions, setAgentOptions] = useState<Array<{ id: string; label: string }>>([]);

  // ── New unified ScheduledTask state ────────────────────────────────────────
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [scheduledTaskDialogOpen, setScheduledTaskDialogOpen] = useState(false);
  const [editingScheduledTask, setEditingScheduledTask] = useState<ScheduledTask | null>(null);

  type StMode = 'interval' | 'cron';
  interface StEditorState {
    agentId: string;
    mode: StMode;
    intervalSeconds: number;
    cronExpression: string;
    timezone: string;
    message: string;
    activeHoursStart: string;
    activeHoursEnd: string;
    name: string;
    enabled: boolean;
  }
  const makeInitialStEditor = (): StEditorState => ({
    agentId: '',
    mode: 'interval',
    intervalSeconds: 300,
    cronExpression: '0 9 * * 1-5',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    message: '',
    activeHoursStart: '',
    activeHoursEnd: '',
    name: '',
    enabled: true,
  });
  const [stEditor, setStEditor] = useState<StEditorState>(makeInitialStEditor);
  const [cronPreviewDates, setCronPreviewDates] = useState<string[]>([]);

  const fetchScheduledTasks = useCallback(async () => {
    try {
      const service = window.service.agentInstance as unknown as {
        listScheduledTasks: () => Promise<ScheduledTask[]>;
      };
      const tasks = await service.listScheduledTasks();
      setScheduledTasks(tasks);
    } catch {
      // Not ready yet
    }
  }, []);

  const handleToggleScheduledTask = useCallback(async (task: ScheduledTask) => {
    try {
      const service = window.service.agentInstance as unknown as {
        updateScheduledTask: (input: { id: string; enabled: boolean }) => Promise<ScheduledTask>;
      };
      await service.updateScheduledTask({ id: task.id, enabled: !task.enabled });
      void fetchScheduledTasks();
    } catch {
      // ignore
    }
  }, [fetchScheduledTasks]);

  const handleDeleteScheduledTask = useCallback(async (taskId: string) => {
    try {
      const service = window.service.agentInstance as unknown as {
        deleteScheduledTask: (id: string) => Promise<void>;
      };
      await service.deleteScheduledTask(taskId);
      void fetchScheduledTasks();
    } catch {
      // ignore
    }
  }, [fetchScheduledTasks]);

  const handleSaveScheduledTask = useCallback(async () => {
    try {
      const service = window.service.agentInstance as unknown as {
        createScheduledTask: (input: CreateScheduledTaskInput) => Promise<ScheduledTask>;
        updateScheduledTask: (input: { id: string } & Partial<CreateScheduledTaskInput>) => Promise<ScheduledTask>;
        getCronPreviewDates: (expr: string, tz?: string, count?: number) => Promise<string[]>;
      };

      const schedule: CreateScheduledTaskInput['schedule'] = stEditor.mode === 'interval'
        ? { kind: 'interval', intervalSeconds: Math.max(60, stEditor.intervalSeconds) }
        : { kind: 'cron', expression: stEditor.cronExpression, timezone: stEditor.timezone || undefined };

      const input: CreateScheduledTaskInput = {
        agentInstanceId: stEditor.agentId,
        name: stEditor.name || undefined,
        scheduleKind: stEditor.mode,
        schedule,
        payload: stEditor.message ? { message: stEditor.message } : undefined,
        activeHoursStart: stEditor.activeHoursStart || undefined,
        activeHoursEnd: stEditor.activeHoursEnd || undefined,
        enabled: stEditor.enabled,
        createdBy: 'settings-ui',
      };

      if (editingScheduledTask) {
        await service.updateScheduledTask({ id: editingScheduledTask.id, ...input });
      } else {
        await service.createScheduledTask(input);
      }
      setScheduledTaskDialogOpen(false);
      setEditingScheduledTask(null);
      void fetchScheduledTasks();
    } catch {
      // ignore
    }
  }, [editingScheduledTask, fetchScheduledTasks, stEditor]);

  // Update cron preview when expression changes
  useEffect(() => {
    if (stEditor.mode !== 'cron' || !stEditor.cronExpression) {
      setCronPreviewDates([]);
      return;
    }
    const service = window.service.agentInstance as unknown as {
      getCronPreviewDates: (expr: string, tz?: string, count?: number) => Promise<string[]>;
    };
    void service.getCronPreviewDates(stEditor.cronExpression, stEditor.timezone, 3)
      .then(dates => {
        setCronPreviewDates(dates);
      })
      .catch(() => {
        setCronPreviewDates([]);
      });
  }, [stEditor.cronExpression, stEditor.timezone, stEditor.mode]);

  const fetchAgentOptions = useCallback(async () => {
    try {
      const agents = await window.service.agentInstance.getAgents(1, 200, { closed: false });
      const options = agents.map(agent => ({
        id: agent.id,
        label: agent.name ?? agent.agentDefId,
      }));
      setAgentOptions(options);
      return options;
    } catch {
      return [] as Array<{ id: string; label: string }>;
    }
  }, []);

  useEffect(() => {
    void fetchScheduledTasks();
  }, [fetchScheduledTasks]);

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
      <SectionTitle ref={props.sectionRef}>{t('Preference.AIAgent')}</SectionTitle>
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

        {/* ── Scheduled Tasks sub-section ─────────────────────────────── */}
        <Divider />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 2, pt: 1.5, pb: 0.5 }}>
          <AccessTimeIcon fontSize='small' sx={{ color: 'text.secondary' }} />
          <Typography variant='caption' sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary', flex: 1 }}>
            {t('Preference.ScheduledTasks', 'Scheduled Tasks')}
          </Typography>
          <Button
            size='small'
            startIcon={<AddIcon />}
            onClick={async () => {
              const options = await fetchAgentOptions();
              setEditingScheduledTask(null);
              setStEditor({ ...makeInitialStEditor(), agentId: options[0]?.id ?? '' });
              setScheduledTaskDialogOpen(true);
            }}
            data-testid='scheduled-task-add-button'
          >
            {t('Preference.AddScheduledTask', 'Add Task')}
          </Button>
          <Button
            size='small'
            onClick={() => {
              void fetchScheduledTasks();
            }}
          >
            {t('Refresh')}
          </Button>
        </Box>
        <Typography variant='body2' color='text.secondary' sx={{ px: 2, pb: 1, fontSize: '0.8rem' }}>
          {t('Preference.ScheduledTasksDescription', 'Periodically wake agents on a schedule (interval or cron). Tasks survive app restarts.')}
        </Typography>

        {scheduledTasks.length === 0
          ? (
            <Box sx={{ px: 2, py: 2, textAlign: 'center' }}>
              <Typography variant='body2' color='text.secondary'>
                {t('Preference.NoScheduledTasks', 'No scheduled tasks. Add one to periodically wake an agent.')}
              </Typography>
            </Box>
          )
          : (
            <Table size='small' data-testid='scheduled-tasks-table'>
              <TableHead>
                <TableRow>
                  <TableCell>{t('Name')}</TableCell>
                  <TableCell>{t('Agent')}</TableCell>
                  <TableCell>{t('Type')}</TableCell>
                  <TableCell>{t('Schedule')}</TableCell>
                  <TableCell>{t('Next Run')}</TableCell>
                  <TableCell>{t('Runs')}</TableCell>
                  <TableCell>{t('Enabled')}</TableCell>
                  <TableCell>{t('Actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {scheduledTasks.map(task => {
                  const scheduleDesc = task.scheduleKind === 'interval'
                    ? `Every ${(task.schedule as { intervalSeconds: number }).intervalSeconds}s`
                    : task.scheduleKind === 'cron'
                    ? `Cron: ${(task.schedule as { expression: string }).expression}`
                    : `At: ${(task.schedule as { wakeAtISO: string }).wakeAtISO}`;
                  const nextRun = task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : '—';
                  const agentOption = agentOptions.find(a => a.id === task.agentInstanceId);
                  const typeIcon = task.scheduleKind === 'interval' ? <FavoriteIcon fontSize='inherit' color='success' /> : <AlarmIcon fontSize='inherit' color='warning' />;

                  return (
                    <TableRow key={task.id} data-testid={`scheduled-task-row-${task.id}`}>
                      <TableCell>{task.name ?? '—'}</TableCell>
                      <TableCell>{agentOption?.label ?? task.agentInstanceId.slice(0, 8)}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {typeIcon}
                          {task.scheduleKind}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={task.payload?.message ?? ''}>
                          <span>{scheduleDesc}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{nextRun}</TableCell>
                      <TableCell>{task.runCount}</TableCell>
                      <TableCell>
                        <Switch
                          size='small'
                          checked={task.enabled}
                          onChange={() => {
                            void handleToggleScheduledTask(task);
                          }}
                          data-testid={`scheduled-task-enable-${task.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Tooltip title='Edit'>
                          <IconButton
                            size='small'
                            onClick={async () => {
                              await fetchAgentOptions();
                              setEditingScheduledTask(task);
                              const s = task.schedule;
                              setStEditor({
                                agentId: task.agentInstanceId,
                                mode: task.scheduleKind === 'cron' ? 'cron' : 'interval',
                                intervalSeconds: s.kind === 'interval' ? s.intervalSeconds : 300,
                                cronExpression: s.kind === 'cron' ? s.expression : '0 9 * * 1-5',
                                timezone: (s as { timezone?: string }).timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
                                message: task.payload?.message ?? '',
                                activeHoursStart: task.activeHoursStart ?? '',
                                activeHoursEnd: task.activeHoursEnd ?? '',
                                name: task.name ?? '',
                                enabled: task.enabled,
                              });
                              setScheduledTaskDialogOpen(true);
                            }}
                            data-testid={`scheduled-task-edit-${task.id}`}
                          >
                            <EditIcon fontSize='small' />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title='Delete'>
                          <IconButton
                            size='small'
                            onClick={() => {
                              void handleDeleteScheduledTask(task.id);
                            }}
                            data-testid={`scheduled-task-delete-${task.id}`}
                          >
                            <DeleteIcon fontSize='small' />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
      </Paper>

      {/* ── ScheduledTask create/edit dialog ──────────────────────────────── */}
      <Dialog
        open={scheduledTaskDialogOpen}
        onClose={() => {
          setScheduledTaskDialogOpen(false);
        }}
        maxWidth='sm'
        fullWidth
        data-testid='scheduled-task-dialog'
      >
        <DialogTitle>{editingScheduledTask ? 'Edit Scheduled Task' : 'Add Scheduled Task'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            select
            label='Agent'
            margin='dense'
            value={stEditor.agentId}
            onChange={(event) => {
              setStEditor(p => ({ ...p, agentId: event.target.value }));
            }}
            data-testid='scheduled-task-agent-select'
          >
            {agentOptions.map(o => <MenuItem key={o.id} value={o.id}>{o.label}</MenuItem>)}
          </TextField>

          <TextField
            fullWidth
            label='Task name (optional)'
            margin='dense'
            value={stEditor.name}
            onChange={(event) => {
              setStEditor(p => ({ ...p, name: event.target.value }));
            }}
            data-testid='scheduled-task-name-input'
          />

          <TextField
            fullWidth
            select
            label='Schedule mode'
            margin='dense'
            value={stEditor.mode}
            onChange={(event) => {
              setStEditor(p => ({ ...p, mode: event.target.value as StMode }));
            }}
            data-testid='scheduled-task-mode-select'
          >
            <MenuItem value='interval'>Interval (every N seconds)</MenuItem>
            <MenuItem value='cron'>Cron expression</MenuItem>
          </TextField>

          {stEditor.mode === 'interval' && (
            <TextField
              fullWidth
              type='number'
              label='Interval (seconds)'
              margin='dense'
              value={stEditor.intervalSeconds}
              onChange={(event) => {
                setStEditor(p => ({ ...p, intervalSeconds: Number.parseInt(event.target.value || '300', 10) }));
              }}
              slotProps={{ htmlInput: { min: 60 } }}
              data-testid='scheduled-task-interval-input'
            />
          )}

          {stEditor.mode === 'cron' && (
            <>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  label='Cron expression'
                  margin='dense'
                  value={stEditor.cronExpression}
                  onChange={(event) => {
                    setStEditor(p => ({ ...p, cronExpression: event.target.value }));
                  }}
                  helperText='min hour day month weekday'
                  sx={{ flex: 2 }}
                  data-testid='scheduled-task-cron-input'
                />
                <TextField
                  label='Timezone'
                  margin='dense'
                  value={stEditor.timezone}
                  onChange={(event) => {
                    setStEditor(p => ({ ...p, timezone: event.target.value }));
                  }}
                  sx={{ flex: 1 }}
                  data-testid='scheduled-task-timezone-input'
                />
              </Box>
              {cronPreviewDates.length > 0 && (
                <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.5 }}>
                  {'Next runs: '}
                  {cronPreviewDates.map(d => new Date(d).toLocaleString()).join(' → ')}
                </Typography>
              )}
            </>
          )}

          <TextField
            fullWidth
            multiline
            minRows={2}
            label='Wake-up message (optional)'
            margin='dense'
            value={stEditor.message}
            onChange={(event) => {
              setStEditor(p => ({ ...p, message: event.target.value }));
            }}
            data-testid='scheduled-task-message-input'
          />

          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              type='time'
              label='Active hours start (optional)'
              margin='dense'
              value={stEditor.activeHoursStart}
              onChange={(event) => {
                setStEditor(p => ({ ...p, activeHoursStart: event.target.value }));
              }}
              sx={{ flex: 1 }}
              data-testid='scheduled-task-active-start-input'
            />
            <TextField
              type='time'
              label='Active hours end (optional)'
              margin='dense'
              value={stEditor.activeHoursEnd}
              onChange={(event) => {
                setStEditor(p => ({ ...p, activeHoursEnd: event.target.value }));
              }}
              sx={{ flex: 1 }}
              data-testid='scheduled-task-active-end-input'
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setScheduledTaskDialogOpen(false);
            }}
            data-testid='scheduled-task-cancel-button'
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              void handleSaveScheduledTask();
            }}
            data-testid='scheduled-task-save-button'
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

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
