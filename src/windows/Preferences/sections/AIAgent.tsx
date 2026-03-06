import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AlarmIcon from '@mui/icons-material/Alarm';
import AddIcon from '@mui/icons-material/Add';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FavoriteIcon from '@mui/icons-material/Favorite';
import SecurityIcon from '@mui/icons-material/Security';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
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
import type { AgentBackgroundTask } from '@/services/agentInstance/interface';
import type { CreateScheduledTaskInput, ScheduledTask } from '@/services/agentInstance/scheduledTaskManager';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';
import { ToolApprovalSettingsDialog } from './ExternalAPI/components/ToolApprovalSettingsDialog';

export function AIAgent(props: ISectionProps): React.JSX.Element {
  type AlarmScheduleMode = 'countdown' | 'daily' | 'interval';

  interface AlarmEditorState {
    agentId: string;
    mode: AlarmScheduleMode;
    countdownMinutes: number;
    dailyTime: string;
    intervalMinutes: number;
    message: string;
  }

  interface HeartbeatEditorState {
    agentId: string;
    enabled: boolean;
    intervalSeconds: number;
    message: string;
    activeHoursStart: string;
    activeHoursEnd: string;
  }

  const makeInitialAlarmEditorState = (): AlarmEditorState => ({
    agentId: '',
    mode: 'countdown',
    countdownMinutes: 30,
    dailyTime: '09:00',
    intervalMinutes: 60,
    message: '',
  });

  const makeInitialHeartbeatEditorState = (): HeartbeatEditorState => ({
    agentId: '',
    enabled: true,
    intervalSeconds: 300,
    message: '',
    activeHoursStart: '',
    activeHoursEnd: '',
  });

  const { t } = useTranslation('agent');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toolApprovalDialogOpen, setToolApprovalDialogOpen] = useState(false);
  const [agentInfo, setAgentInfo] = useState<{ exists: boolean; size?: number; path?: string }>({ exists: false });
  const [backgroundTasks, setBackgroundTasks] = useState<AgentBackgroundTask[]>([]);
  const [alarmDialogOpen, setAlarmDialogOpen] = useState(false);
  const [isEditingAlarm, setIsEditingAlarm] = useState(false);
  const [alarmEditor, setAlarmEditor] = useState<AlarmEditorState>(makeInitialAlarmEditorState);
  const [heartbeatDialogOpen, setHeartbeatDialogOpen] = useState(false);
  const [isEditingHeartbeat, setIsEditingHeartbeat] = useState(false);
  const [heartbeatEditor, setHeartbeatEditor] = useState<HeartbeatEditorState>(makeInitialHeartbeatEditorState);
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

  const fetchBackgroundTasks = useCallback(async () => {
    try {
      const tasks = await window.service.agentInstance.getBackgroundTasks();
      setBackgroundTasks(tasks);
    } catch {
      // Service may not be ready yet
    }
  }, []);

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
      .then(dates => { setCronPreviewDates(dates); })
      .catch(() => { setCronPreviewDates([]); });
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

  const toDailyTime = (iso?: string) => {
    if (!iso) return '09:00';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '09:00';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const openCreateAlarmDialog = useCallback(async () => {
    const options = await fetchAgentOptions();
    setIsEditingAlarm(false);
    setAlarmEditor({
      ...makeInitialAlarmEditorState(),
      agentId: options[0]?.id ?? '',
    });
    setAlarmDialogOpen(true);
  }, [fetchAgentOptions]);

  const openCreateHeartbeatDialog = useCallback(async () => {
    const options = await fetchAgentOptions();
    setIsEditingHeartbeat(false);
    setHeartbeatEditor({
      ...makeInitialHeartbeatEditorState(),
      agentId: options[0]?.id ?? '',
    });
    setHeartbeatDialogOpen(true);
  }, [fetchAgentOptions]);

  const openEditAlarmDialog = useCallback(async (task: AgentBackgroundTask) => {
    const options = await fetchAgentOptions();
    const wakeSource = task.nextWakeAtISO ?? task.wakeAtISO;
    const now = Date.now();
    const wakeMs = wakeSource ? new Date(wakeSource).getTime() : now;
    const countdownMinutes = Math.max(1, Math.round((wakeMs - now) / 60000));
    const repeatIntervalMinutes = task.repeatIntervalMinutes ?? 0;

    let mode: AlarmScheduleMode = 'countdown';
    if (repeatIntervalMinutes > 0) {
      mode = repeatIntervalMinutes === 1440 ? 'daily' : 'interval';
    }

    setIsEditingAlarm(true);
    setAlarmEditor({
      agentId: task.agentId || options[0]?.id || '',
      mode,
      countdownMinutes,
      dailyTime: toDailyTime(wakeSource),
      intervalMinutes: repeatIntervalMinutes > 0 ? repeatIntervalMinutes : 60,
      message: task.message ?? '',
    });
    setAlarmDialogOpen(true);
  }, [fetchAgentOptions]);

  const openEditHeartbeatDialog = useCallback(async (task: AgentBackgroundTask) => {
    const options = await fetchAgentOptions();

    setIsEditingHeartbeat(true);
    setHeartbeatEditor({
      agentId: task.agentId || options[0]?.id || '',
      enabled: true,
      intervalSeconds: Math.max(60, task.intervalSeconds ?? 300),
      message: task.message ?? '',
      activeHoursStart: task.activeHoursStart ?? '',
      activeHoursEnd: task.activeHoursEnd ?? '',
    });
    setHeartbeatDialogOpen(true);
  }, [fetchAgentOptions]);

  const saveAlarmFromEditor = useCallback(async () => {
    const resolvedAgentId = alarmEditor.agentId || agentOptions[0]?.id;
    if (!resolvedAgentId) {
      return;
    }

    const now = new Date();
    let wakeAt = new Date(now);
    let repeatIntervalMinutes: number | undefined;

    if (alarmEditor.mode === 'countdown') {
      const countdownMinutes = Math.max(1, Math.round(alarmEditor.countdownMinutes || 1));
      wakeAt = new Date(now.getTime() + countdownMinutes * 60_000);
    } else if (alarmEditor.mode === 'interval') {
      const intervalMinutes = Math.max(1, Math.round(alarmEditor.intervalMinutes || 1));
      wakeAt = new Date(now.getTime() + intervalMinutes * 60_000);
      repeatIntervalMinutes = intervalMinutes;
    } else {
      const [hourRaw, minuteRaw] = alarmEditor.dailyTime.split(':').map(Number);
      const hours = Number.isFinite(hourRaw) ? hourRaw : 9;
      const minutes = Number.isFinite(minuteRaw) ? minuteRaw : 0;
      wakeAt.setHours(hours, minutes, 0, 0);
      if (wakeAt.getTime() <= now.getTime()) {
        wakeAt.setDate(wakeAt.getDate() + 1);
      }
      repeatIntervalMinutes = 24 * 60;
    }

    try {
      await window.service.agentInstance.setBackgroundAlarm(resolvedAgentId, {
        wakeAtISO: wakeAt.toISOString(),
        message: alarmEditor.message.trim() || undefined,
        repeatIntervalMinutes,
      });
      setAlarmDialogOpen(false);
      void fetchBackgroundTasks();
    } catch (error) {
      void window.service.native.log('error', 'AIAgent: set background alarm failed', {
        function: 'AIAgent.saveAlarmFromEditor',
        error,
      });
    }
  }, [agentOptions, alarmEditor, fetchBackgroundTasks]);

  const saveHeartbeatFromEditor = useCallback(async () => {
    const resolvedAgentId = heartbeatEditor.agentId || agentOptions[0]?.id;
    if (!resolvedAgentId) return;

    const intervalSeconds = Math.max(60, Math.round(heartbeatEditor.intervalSeconds || 60));

    try {
      await window.service.agentInstance.setBackgroundHeartbeat(resolvedAgentId, {
        enabled: heartbeatEditor.enabled,
        intervalSeconds,
        message: heartbeatEditor.message.trim() || undefined,
        activeHoursStart: heartbeatEditor.activeHoursStart || undefined,
        activeHoursEnd: heartbeatEditor.activeHoursEnd || undefined,
      });

      setHeartbeatDialogOpen(false);
      void fetchBackgroundTasks();
    } catch (error) {
      void window.service.native.log('error', 'AIAgent: set background heartbeat failed', {
        function: 'AIAgent.saveHeartbeatFromEditor',
        error,
      });
    }
  }, [agentOptions, fetchBackgroundTasks, heartbeatEditor]);

  useEffect(() => {
    void fetchBackgroundTasks();
    void fetchScheduledTasks();
  }, [fetchBackgroundTasks, fetchScheduledTasks]);

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

      {/* ── Unified Scheduled Tasks (New) ─────────────────────────────── */}
      <SectionTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccessTimeIcon fontSize='small' />
          {t('Preference.ScheduledTasks', 'Scheduled Tasks')}
        </Box>
      </SectionTitle>
      <Paper elevation={0} sx={{ p: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, px: 1 }}>
          <Typography variant='body2' color='text.secondary'>
            {t('Preference.ScheduledTasksDescription', 'Periodically wake agents on a schedule (interval or cron). Tasks survive app restarts.')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
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
              onClick={() => { void fetchScheduledTasks(); }}
            >
              {t('Refresh')}
            </Button>
          </Box>
        </Box>

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
                          onChange={() => { void handleToggleScheduledTask(task); }}
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
                            onClick={() => { void handleDeleteScheduledTask(task.id); }}
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

      {/* ── Legacy Background Tasks (heartbeat / alarm) ─────────────────── */}
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
                void openCreateAlarmDialog();
              }}
              data-testid='bg-task-add-button'
            >
              Add
            </Button>
            <Button
              size='small'
              onClick={() => {
                void openCreateHeartbeatDialog();
              }}
              data-testid='bg-heartbeat-add-button'
            >
              Add Heartbeat
            </Button>
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
                  ? `Every ${task.intervalSeconds ?? '?'}s${task.activeHoursStart && task.activeHoursEnd ? ` (${task.activeHoursStart}-${task.activeHoursEnd})` : ''} — ${
                    task.message ?? ''
                  }${task.runCount !== undefined ? ` — runs:${task.runCount}` : ''}${task.lastRunAtISO ? ` — last:${task.lastRunAtISO}` : ''}${
                    task.createdBy ? ` — by:${task.createdBy}` : ''
                  }`
                  : `${task.nextWakeAtISO ?? task.wakeAtISO ?? '?'}${task.repeatIntervalMinutes ? ` (repeat every ${task.repeatIntervalMinutes}min)` : ''} — ${task.message ?? ''}${
                    task.runCount !== undefined ? ` — runs:${task.runCount}` : ''
                  }${task.lastRunAtISO ? ` — last:${task.lastRunAtISO}` : ''}${task.createdBy ? ` — by:${task.createdBy}` : ''}`}
              />
              {task.type === 'heartbeat' && (
                <Tooltip title='Edit heartbeat'>
                  <IconButton
                    size='small'
                    onClick={() => {
                      void openEditHeartbeatDialog(task);
                    }}
                    data-testid={`edit-bg-task-${task.agentId}-${task.type}`}
                  >
                    <EditIcon fontSize='small' />
                  </IconButton>
                </Tooltip>
              )}
              {task.type === 'alarm' && (
                <Tooltip title='Edit task'>
                  <IconButton
                    size='small'
                    onClick={() => {
                      void openEditAlarmDialog(task);
                    }}
                    data-testid={`edit-bg-task-${task.agentId}-${task.type}`}
                  >
                    <EditIcon fontSize='small' />
                  </IconButton>
                </Tooltip>
              )}
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

      {/* ── ScheduledTask create/edit dialog ──────────────────────────────── */}
      <Dialog
        open={scheduledTaskDialogOpen}
        onClose={() => { setScheduledTaskDialogOpen(false); }}
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
            onChange={(event) => { setStEditor(p => ({ ...p, agentId: event.target.value })); }}
            data-testid='scheduled-task-agent-select'
          >
            {agentOptions.map(o => <MenuItem key={o.id} value={o.id}>{o.label}</MenuItem>)}
          </TextField>

          <TextField
            fullWidth
            label='Task name (optional)'
            margin='dense'
            value={stEditor.name}
            onChange={(event) => { setStEditor(p => ({ ...p, name: event.target.value })); }}
            data-testid='scheduled-task-name-input'
          />

          <TextField
            fullWidth
            select
            label='Schedule mode'
            margin='dense'
            value={stEditor.mode}
            onChange={(event) => { setStEditor(p => ({ ...p, mode: event.target.value as StMode })); }}
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
              onChange={(event) => { setStEditor(p => ({ ...p, intervalSeconds: Number.parseInt(event.target.value || '300', 10) })); }}
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
                  onChange={(event) => { setStEditor(p => ({ ...p, cronExpression: event.target.value })); }}
                  helperText='min hour day month weekday'
                  sx={{ flex: 2 }}
                  data-testid='scheduled-task-cron-input'
                />
                <TextField
                  label='Timezone'
                  margin='dense'
                  value={stEditor.timezone}
                  onChange={(event) => { setStEditor(p => ({ ...p, timezone: event.target.value })); }}
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
            onChange={(event) => { setStEditor(p => ({ ...p, message: event.target.value })); }}
            data-testid='scheduled-task-message-input'
          />

          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              type='time'
              label='Active hours start (optional)'
              margin='dense'
              value={stEditor.activeHoursStart}
              onChange={(event) => { setStEditor(p => ({ ...p, activeHoursStart: event.target.value })); }}
              sx={{ flex: 1 }}
              data-testid='scheduled-task-active-start-input'
            />
            <TextField
              type='time'
              label='Active hours end (optional)'
              margin='dense'
              value={stEditor.activeHoursEnd}
              onChange={(event) => { setStEditor(p => ({ ...p, activeHoursEnd: event.target.value })); }}
              sx={{ flex: 1 }}
              data-testid='scheduled-task-active-end-input'
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setScheduledTaskDialogOpen(false); }} data-testid='scheduled-task-cancel-button'>
            Cancel
          </Button>
          <Button onClick={() => { void handleSaveScheduledTask(); }} data-testid='scheduled-task-save-button'>
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
        open={heartbeatDialogOpen}
        onClose={() => {
          setHeartbeatDialogOpen(false);
        }}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>{isEditingHeartbeat ? 'Edit Heartbeat' : 'Add Heartbeat'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            select
            label='Agent'
            margin='dense'
            value={heartbeatEditor.agentId}
            onChange={(event) => {
              setHeartbeatEditor((previous) => ({ ...previous, agentId: event.target.value }));
            }}
            data-testid='bg-heartbeat-agent-select'
          >
            {agentOptions.map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}
          </TextField>

          <TextField
            fullWidth
            select
            label='Enabled'
            margin='dense'
            value={heartbeatEditor.enabled ? 'enabled' : 'disabled'}
            onChange={(event) => {
              setHeartbeatEditor((previous) => ({ ...previous, enabled: event.target.value === 'enabled' }));
            }}
            data-testid='bg-heartbeat-enabled-select'
          >
            <MenuItem value='enabled'>Enabled</MenuItem>
            <MenuItem value='disabled'>Disabled</MenuItem>
          </TextField>

          <TextField
            fullWidth
            type='number'
            label='Interval (seconds)'
            margin='dense'
            value={heartbeatEditor.intervalSeconds}
            onChange={(event) => {
              setHeartbeatEditor((previous) => ({
                ...previous,
                intervalSeconds: Number.parseInt(event.target.value || '0', 10),
              }));
            }}
            slotProps={{ htmlInput: { min: 60 } }}
            data-testid='bg-heartbeat-interval-input'
          />

          <TextField
            fullWidth
            label='Message'
            margin='dense'
            value={heartbeatEditor.message}
            onChange={(event) => {
              setHeartbeatEditor((previous) => ({ ...previous, message: event.target.value }));
            }}
            data-testid='bg-heartbeat-message-input'
          />

          <TextField
            fullWidth
            type='time'
            label='Active hours start (optional)'
            margin='dense'
            value={heartbeatEditor.activeHoursStart}
            onChange={(event) => {
              setHeartbeatEditor((previous) => ({ ...previous, activeHoursStart: event.target.value }));
            }}
            data-testid='bg-heartbeat-active-start-input'
          />

          <TextField
            fullWidth
            type='time'
            label='Active hours end (optional)'
            margin='dense'
            value={heartbeatEditor.activeHoursEnd}
            onChange={(event) => {
              setHeartbeatEditor((previous) => ({ ...previous, activeHoursEnd: event.target.value }));
            }}
            data-testid='bg-heartbeat-active-end-input'
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setHeartbeatDialogOpen(false);
            }}
            data-testid='bg-heartbeat-cancel-button'
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              void saveHeartbeatFromEditor();
            }}
            data-testid='bg-heartbeat-save-button'
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={alarmDialogOpen}
        onClose={() => {
          setAlarmDialogOpen(false);
        }}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>{isEditingAlarm ? 'Edit Background Alarm' : 'Add Background Alarm'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            select
            label='Agent'
            margin='dense'
            value={alarmEditor.agentId}
            onChange={(event) => {
              setAlarmEditor((previous) => ({ ...previous, agentId: event.target.value }));
            }}
            data-testid='bg-task-agent-select'
          >
            {agentOptions.map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}
          </TextField>

          <TextField
            fullWidth
            select
            label='Schedule Mode'
            margin='dense'
            value={alarmEditor.mode}
            onChange={(event) => {
              setAlarmEditor((previous) => ({ ...previous, mode: event.target.value as AlarmScheduleMode }));
            }}
            data-testid='bg-task-mode-select'
          >
            <MenuItem value='countdown'>Countdown</MenuItem>
            <MenuItem value='daily'>Daily</MenuItem>
            <MenuItem value='interval'>Interval</MenuItem>
          </TextField>

          {alarmEditor.mode === 'countdown' && (
            <TextField
              fullWidth
              type='number'
              label='Minutes from now'
              margin='dense'
              value={alarmEditor.countdownMinutes}
              onChange={(event) => {
                setAlarmEditor((previous) => ({
                  ...previous,
                  countdownMinutes: Number.parseInt(event.target.value || '0', 10),
                }));
              }}
              slotProps={{ htmlInput: { min: 1 } }}
              data-testid='bg-task-countdown-input'
            />
          )}

          {alarmEditor.mode === 'daily' && (
            <TextField
              fullWidth
              type='time'
              label='Daily time'
              margin='dense'
              value={alarmEditor.dailyTime}
              onChange={(event) => {
                setAlarmEditor((previous) => ({ ...previous, dailyTime: event.target.value }));
              }}
              data-testid='bg-task-daily-time-input'
            />
          )}

          {alarmEditor.mode === 'interval' && (
            <TextField
              fullWidth
              type='number'
              label='Repeat every (minutes)'
              margin='dense'
              value={alarmEditor.intervalMinutes}
              onChange={(event) => {
                setAlarmEditor((previous) => ({
                  ...previous,
                  intervalMinutes: Number.parseInt(event.target.value || '0', 10),
                }));
              }}
              slotProps={{ htmlInput: { min: 1 } }}
              data-testid='bg-task-interval-input'
            />
          )}

          <TextField
            fullWidth
            label='Message'
            margin='dense'
            value={alarmEditor.message}
            onChange={(event) => {
              setAlarmEditor((previous) => ({ ...previous, message: event.target.value }));
            }}
            data-testid='bg-task-message-input'
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAlarmDialogOpen(false);
            }}
            data-testid='bg-task-cancel-button'
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              void saveAlarmFromEditor();
            }}
            data-testid='bg-task-save-button'
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

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
