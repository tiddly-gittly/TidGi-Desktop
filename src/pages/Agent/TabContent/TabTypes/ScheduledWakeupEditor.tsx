import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { Alert, Box, Button, CircularProgress, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { AgentDefinition, CreateScheduledTaskInput } from 'memeloop';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ScheduleMode = 'none' | 'interval' | 'daily' | 'cron';
type IntervalUnit = 's' | 'min' | 'h';

interface ScheduleEditorState {
  mode: ScheduleMode;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  dailyTime: string;
  activeHoursStart: string;
  activeHoursEnd: string;
  cronExpression: string;
  timezone: string;
  message: string;
  existingTaskId?: string;
}

interface ScheduledWakeupEditorProps {
  agentDefinition: AgentDefinition;
  previewAgentId: string | null;
}

const SectionContainer = styled(Box)`
  margin-bottom: 32px;
  padding: 24px;
  border-radius: 8px;
  background-color: ${props => props.theme.palette.background.paper};
  border: 1px solid ${props => props.theme.palette.divider};
`;

const SectionTitle = styled(Typography)`
  margin-bottom: 16px;
  font-weight: 600;
  color: ${props => props.theme.palette.primary.main};
`;

const createInitialState = (): ScheduleEditorState => ({
  mode: 'none',
  intervalValue: 5,
  intervalUnit: 'min',
  dailyTime: '09:00',
  activeHoursStart: '',
  activeHoursEnd: '',
  cronExpression: '0 9 * * 1-5',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  message: '',
});

export function ScheduledWakeupEditor({ agentDefinition, previewAgentId }: ScheduledWakeupEditorProps) {
  const { t } = useTranslation('agent');
  const [editor, setEditor] = useState<ScheduleEditorState>(createInitialState);
  const [cronPreviewDates, setCronPreviewDates] = useState<string[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!previewAgentId) {
      setEditor(createInitialState());
      return;
    }

    void window.service.agentInstance.listScheduledTasksForAgent(previewAgentId)
      .then(tasks => {
        if (cancelled) return;
        const task = tasks[0];
        if (!task) {
          setEditor(createInitialState());
          return;
        }

        const schedule = task.schedule;
        const common = {
          message: task.payload?.message ?? '',
          activeHoursStart: task.activeHoursStart ?? '',
          activeHoursEnd: task.activeHoursEnd ?? '',
          existingTaskId: task.id,
        };
        if (schedule.kind === 'interval') {
          const seconds = schedule.intervalSeconds;
          const intervalUnit: IntervalUnit = seconds % 3600 === 0 ? 'h' : seconds % 60 === 0 ? 'min' : 's';
          const intervalValue = intervalUnit === 'h' ? seconds / 3600 : intervalUnit === 'min' ? seconds / 60 : seconds;
          setEditor(previous => ({ ...previous, ...common, mode: 'interval', intervalUnit, intervalValue }));
        } else if (schedule.kind === 'cron') {
          setEditor(previous => ({
            ...previous,
            ...common,
            mode: 'cron',
            cronExpression: schedule.expression,
            timezone: schedule.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          }));
        } else {
          setEditor(previous => ({
            ...previous,
            ...common,
            mode: 'daily',
            dailyTime: new Date(schedule.wakeAtISO).toTimeString().slice(0, 5),
          }));
        }
      })
      .catch(() => {
        if (!cancelled) setEditor(createInitialState());
      });

    return () => {
      cancelled = true;
    };
  }, [previewAgentId]);

  useEffect(() => {
    let cancelled = false;
    if (editor.mode !== 'cron' || !editor.cronExpression) {
      setCronPreviewDates([]);
      return;
    }

    void window.service.agentInstance.getCronPreviewDates(editor.cronExpression, editor.timezone, 3)
      .then(dates => {
        if (!cancelled) setCronPreviewDates(dates);
      })
      .catch(() => {
        if (!cancelled) setCronPreviewDates([]);
      });

    return () => {
      cancelled = true;
    };
  }, [editor.cronExpression, editor.mode, editor.timezone]);

  const saveSchedule = async () => {
    if (!previewAgentId) return;
    setIsSaving(true);
    setScheduleError(null);

    try {
      if (editor.mode === 'none') {
        if (editor.existingTaskId) {
          await window.service.agentInstance.deleteScheduledTask(editor.existingTaskId);
          setEditor(previous => ({ ...previous, existingTaskId: undefined }));
        }
        return;
      }

      const commonInput = {
        agentInstanceId: previewAgentId,
        agentDefinitionId: agentDefinition.id,
        activeHoursStart: editor.activeHoursStart || undefined,
        activeHoursEnd: editor.activeHoursEnd || undefined,
        createdBy: 'agent-definition',
        enabled: true,
      };
      let input: CreateScheduledTaskInput;

      if (editor.mode === 'interval') {
        const multiplier = editor.intervalUnit === 'h' ? 3600 : editor.intervalUnit === 'min' ? 60 : 1;
        input = {
          ...commonInput,
          name: `${agentDefinition.name ?? 'Agent'} interval`,
          scheduleKind: 'interval',
          schedule: { kind: 'interval', intervalSeconds: Math.max(60, editor.intervalValue * multiplier) },
          payload: { message: editor.message || '[Heartbeat] Periodic check-in. Review your tasks and take any pending actions.' },
        };
      } else {
        const expression = editor.mode === 'daily'
          ? (() => {
            const [hours, minutes] = editor.dailyTime.split(':').map(Number);
            return `${minutes ?? 0} ${hours ?? 9} * * *`;
          })()
          : editor.cronExpression;
        input = {
          ...commonInput,
          name: `${agentDefinition.name ?? 'Agent'} ${editor.mode}`,
          scheduleKind: 'cron',
          schedule: { kind: 'cron', expression, timezone: editor.timezone || undefined },
          payload: {
            message: editor.message || (editor.mode === 'daily'
              ? '[Scheduled] Daily check-in. Review your tasks and take any pending actions.'
              : '[Scheduled] Cron check-in. Review your tasks and take any pending actions.'),
          },
        };
      }

      if (editor.existingTaskId) {
        await window.service.agentInstance.updateScheduledTask({ id: editor.existingTaskId, ...input });
      } else {
        const created = await window.service.agentInstance.createScheduledTask(input);
        setEditor(previous => ({ ...previous, existingTaskId: created.id }));
      }
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SectionContainer data-testid='edit-agent-schedule-section'>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <AccessTimeIcon sx={{ mr: 1, color: 'primary.main' }} />
        <SectionTitle variant='h6' sx={{ mb: 0 }}>
          {t('EditAgent.ScheduledWakeup')}
        </SectionTitle>
      </Box>
      <Typography variant='body2' gutterBottom sx={{ color: 'text.secondary' }}>
        {t('EditAgent.ScheduledWakeupDescription')}
      </Typography>

      <TextField
        select
        fullWidth
        margin='dense'
        label={t('EditAgent.ScheduleMode')}
        value={editor.mode}
        onChange={event => {
          setEditor(previous => ({ ...previous, mode: event.target.value as ScheduleMode }));
        }}
        data-testid='edit-agent-schedule-mode-select'
      >
        <MenuItem value='none'>{t('EditAgent.ScheduleNone')}</MenuItem>
        <MenuItem value='interval'>{t('EditAgent.ScheduleInterval')}</MenuItem>
        <MenuItem value='daily'>{t('EditAgent.ScheduleDaily')}</MenuItem>
        <MenuItem value='cron'>{t('EditAgent.ScheduleCron')}</MenuItem>
      </TextField>

      {editor.mode === 'interval' && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <TextField
            type='number'
            label={t('EditAgent.ScheduleIntervalValue')}
            value={editor.intervalValue}
            onChange={event => {
              setEditor(previous => ({ ...previous, intervalValue: Number.parseInt(event.target.value || '1', 10) }));
            }}
            slotProps={{ htmlInput: { min: 1 } }}
            sx={{ flex: 2 }}
            data-testid='edit-agent-schedule-interval-value'
          />
          <TextField
            select
            label={t('EditAgent.ScheduleIntervalUnit')}
            value={editor.intervalUnit}
            onChange={event => {
              setEditor(previous => ({ ...previous, intervalUnit: event.target.value as IntervalUnit }));
            }}
            sx={{ flex: 1 }}
            data-testid='edit-agent-schedule-interval-unit'
          >
            <MenuItem value='s'>{t('EditAgent.Seconds')}</MenuItem>
            <MenuItem value='min'>{t('EditAgent.Minutes')}</MenuItem>
            <MenuItem value='h'>{t('EditAgent.Hours')}</MenuItem>
          </TextField>
        </Box>
      )}

      {editor.mode === 'daily' && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <TextField
            type='time'
            label={t('EditAgent.ScheduleDailyTime')}
            value={editor.dailyTime}
            onChange={event => {
              setEditor(previous => ({ ...previous, dailyTime: event.target.value }));
            }}
            sx={{ flex: 1 }}
            data-testid='edit-agent-schedule-daily-time'
          />
          <TextField
            value={editor.timezone}
            label={t('EditAgent.ScheduleTimezone')}
            onChange={event => {
              setEditor(previous => ({ ...previous, timezone: event.target.value }));
            }}
            sx={{ flex: 1 }}
            data-testid='edit-agent-schedule-timezone'
          />
        </Box>
      )}

      {editor.mode === 'cron' && (
        <Box sx={{ mt: 1 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label={t('EditAgent.ScheduleCronExpr')}
              value={editor.cronExpression}
              onChange={event => {
                setEditor(previous => ({ ...previous, cronExpression: event.target.value }));
              }}
              placeholder='0 9 * * 1-5'
              helperText={t('EditAgent.ScheduleCronHelp')}
              sx={{ flex: 2 }}
              data-testid='edit-agent-schedule-cron-expr'
            />
            <TextField
              label={t('EditAgent.ScheduleTimezone')}
              value={editor.timezone}
              onChange={event => {
                setEditor(previous => ({ ...previous, timezone: event.target.value }));
              }}
              sx={{ flex: 1 }}
              data-testid='edit-agent-schedule-cron-timezone'
            />
          </Box>
          {cronPreviewDates.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                {t('EditAgent.ScheduleCronPreview')} {cronPreviewDates.map(date => new Date(date).toLocaleString()).join(' → ')}
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {editor.mode !== 'none' && (
        <>
          <TextField
            fullWidth
            multiline
            minRows={2}
            margin='dense'
            label={t('EditAgent.ScheduleMessage')}
            value={editor.message}
            onChange={event => {
              setEditor(previous => ({ ...previous, message: event.target.value }));
            }}
            placeholder={t('EditAgent.ScheduleMessagePlaceholder')}
            data-testid='edit-agent-schedule-message'
          />
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
            <TextField
              type='time'
              label={t('EditAgent.ActiveHoursStart')}
              value={editor.activeHoursStart}
              onChange={event => {
                setEditor(previous => ({ ...previous, activeHoursStart: event.target.value }));
              }}
              sx={{ flex: 1 }}
              data-testid='edit-agent-schedule-active-start'
            />
            <TextField
              type='time'
              label={t('EditAgent.ActiveHoursEnd')}
              value={editor.activeHoursEnd}
              onChange={event => {
                setEditor(previous => ({ ...previous, activeHoursEnd: event.target.value }));
              }}
              sx={{ flex: 1 }}
              data-testid='edit-agent-schedule-active-end'
            />
          </Box>

          {scheduleError && <Alert severity='error' sx={{ mt: 1 }}>{scheduleError}</Alert>}

          <Tooltip title={!previewAgentId ? t('EditAgent.ScheduleSaveWait') : ''} placement='right'>
            <span>
              <Button
                variant='outlined'
                size='small'
                onClick={() => void saveSchedule()}
                disabled={isSaving || !previewAgentId}
                sx={{ mt: 1 }}
                data-testid='edit-agent-schedule-save-button'
                startIcon={isSaving ? <CircularProgress size={14} /> : null}
              >
                {isSaving
                  ? t('EditAgent.ScheduleSaving')
                  : editor.existingTaskId
                  ? t('EditAgent.ScheduleUpdate')
                  : t('EditAgent.ScheduleSave')}
              </Button>
            </span>
          </Tooltip>
        </>
      )}
    </SectionContainer>
  );
}
