import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { Alert, Box, Button, CircularProgress, Container, Divider, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { RJSFSchema } from '@rjsf/utils';
import type { AgentDefinition } from '@services/agentDefinition/interface';
import { AgentFrameworkConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import type { CreateScheduledTaskInput, ScheduledTask } from '@services/agentInstance/scheduledTaskManager';
import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatTabContent } from '../../../ChatTabContent';
import { PromptConfigForm } from '../../../ChatTabContent/components/PromptPreviewDialog/PromptConfigForm';
import type { IEditAgentDefinitionTab } from '../../types/tab';
import { TabState, TabType } from '../../types/tab';

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
  /** ID of the persisted ScheduledTask, if one already exists */
  existingTaskId?: string;
}

interface EditAgentDefinitionContentProps {
  tab: IEditAgentDefinitionTab;
}

const Container_ = styled(Container)`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  max-width: none !important;
  padding: 32px 32px 0 32px;
  overflow: hidden;
  background-color: ${props => props.theme.palette.background.default};
`;

const ScrollableContent = styled(Box)`
  flex: 1;
  overflow-y: auto;
  padding-bottom: 16px;
`;

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

const ActionBar = styled(Box)`
  background-color: ${props => props.theme.palette.background.paper};
  padding: 16px 32px;
  border-top: 1px solid ${props => props.theme.palette.divider};
  display: flex;
  justify-content: center;
  flex-shrink: 0;
`;

export const EditAgentDefinitionContent: React.FC<EditAgentDefinitionContentProps> = ({ tab }) => {
  const { t } = useTranslation('agent');

  const [agentDefinition, setAgentDefinition] = useState<AgentDefinition | null>(null);
  const [agentName, setAgentName] = useState('');
  const [previewAgentId, setPreviewAgentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const previewTabId = `preview-${tab.agentDefId}`;
  const [isSaving, setIsSaving] = useState(false);
  const [promptSchema, setPromptSchema] = useState<RJSFSchema | null>(null);
  // Use stable timestamp to avoid recreating tab on every render
  const [tabTimestamp] = useState(() => Date.now());
  const [forceRecreatePreview, setForceRecreatePreview] = useState(0);

  // ── Schedule editor state ─────────────────────────────────────────────────
  const [scheduleEditor, setScheduleEditor] = useState<ScheduleEditorState>({
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
  const [cronPreviewDates, setCronPreviewDates] = useState<string[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isScheduleSaving, setIsScheduleSaving] = useState(false);

  // Load agent definition
  useEffect(() => {
    const loadAgentDefinition = async () => {
      if (!tab.agentDefId) return;

      try {
        setIsLoading(true);
        const definition = await window.service.agentDefinition.getAgentDef(tab.agentDefId);
        if (definition) {
          setAgentDefinition(definition);
          setAgentName(definition.name || '');

          // Agent definition loaded successfully
        }
      } catch (error) {
        void window.service.native.log('error', 'Failed to load agent definition', { error, agentDefId: tab.agentDefId });
        console.error('Failed to load agent definition:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadAgentDefinition();
  }, [tab.agentDefId]);

  // Load existing scheduled tasks for this agent definition (preview agent doesn't exist yet)
  const loadExistingSchedule = useCallback(async (previewId: string | null) => {
    if (!previewId) return;
    try {
      const service = window.service.agentInstance as unknown as {
        listScheduledTasksForAgent: (id: string) => Promise<ScheduledTask[]>;
      };
      const tasks = await service.listScheduledTasksForAgent(previewId);
      const task = tasks[0];
      if (!task) {
        setScheduleEditor(previous => ({ ...previous, mode: 'none', existingTaskId: undefined }));
        return;
      }

      const schedule = task.schedule;
      if (schedule.kind === 'interval') {
        const seconds = schedule.intervalSeconds;
        const unit: IntervalUnit = seconds % 3600 === 0 ? 'h' : seconds % 60 === 0 ? 'min' : 's';
        const value = unit === 'h' ? seconds / 3600 : unit === 'min' ? seconds / 60 : seconds;
        setScheduleEditor(previous => ({
          ...previous,
          mode: 'interval',
          intervalValue: value,
          intervalUnit: unit,
          message: task.payload?.message ?? '',
          activeHoursStart: task.activeHoursStart ?? '',
          activeHoursEnd: task.activeHoursEnd ?? '',
          existingTaskId: task.id,
        }));
      } else if (schedule.kind === 'cron') {
        setScheduleEditor(previous => ({
          ...previous,
          mode: 'cron',
          cronExpression: schedule.expression,
          timezone: schedule.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          message: task.payload?.message ?? '',
          activeHoursStart: task.activeHoursStart ?? '',
          activeHoursEnd: task.activeHoursEnd ?? '',
          existingTaskId: task.id,
        }));
      } else if (schedule.kind === 'at') {
        // at-kind tasks from EditAgentDef are treated as daily (cron: "0 HH MM * *")
        setScheduleEditor(previous => ({
          ...previous,
          mode: 'daily',
          dailyTime: schedule.wakeAtISO ? new Date(schedule.wakeAtISO).toTimeString().slice(0, 5) : '09:00',
          message: task.payload?.message ?? '',
          activeHoursStart: task.activeHoursStart ?? '',
          activeHoursEnd: task.activeHoursEnd ?? '',
          existingTaskId: task.id,
        }));
      }
    } catch {
      // No existing schedule or service not ready
    }
  }, []);

  // Update cron preview when expression changes
  useEffect(() => {
    if (scheduleEditor.mode !== 'cron' || !scheduleEditor.cronExpression) {
      setCronPreviewDates([]);
      return;
    }
    const service = window.service.agentInstance as unknown as {
      getCronPreviewDates: (expr: string, tz?: string, count?: number) => Promise<string[]>;
    };
    void service.getCronPreviewDates(scheduleEditor.cronExpression, scheduleEditor.timezone, 3)
      .then(dates => {
        setCronPreviewDates(dates);
      })
      .catch(() => {
        setCronPreviewDates([]);
      });
  }, [scheduleEditor.cronExpression, scheduleEditor.timezone, scheduleEditor.mode]);

  const handleSaveSchedule = useCallback(async () => {
    if (!previewAgentId || !agentDefinition) return;
    setIsScheduleSaving(true);
    setScheduleError(null);

    try {
      const service = window.service.agentInstance as unknown as {
        createScheduledTask: (input: CreateScheduledTaskInput) => Promise<ScheduledTask>;
        updateScheduledTask: (input: { id: string } & Partial<CreateScheduledTaskInput>) => Promise<ScheduledTask>;
        deleteScheduledTask: (id: string) => Promise<void>;
      };

      if (scheduleEditor.mode === 'none') {
        if (scheduleEditor.existingTaskId) {
          await service.deleteScheduledTask(scheduleEditor.existingTaskId);
          setScheduleEditor(previous => ({ ...previous, existingTaskId: undefined }));
        }
        return;
      }

      let input: CreateScheduledTaskInput;

      if (scheduleEditor.mode === 'interval') {
        const multiplier = scheduleEditor.intervalUnit === 'h' ? 3600 : scheduleEditor.intervalUnit === 'min' ? 60 : 1;
        const intervalSeconds = Math.max(60, scheduleEditor.intervalValue * multiplier);
        input = {
          agentInstanceId: previewAgentId,
          agentDefinitionId: agentDefinition.id,
          name: `${agentDefinition.name ?? 'Agent'} interval`,
          scheduleKind: 'interval',
          schedule: { kind: 'interval', intervalSeconds },
          payload: { message: scheduleEditor.message || '[Heartbeat] Periodic check-in. Review your tasks and take any pending actions.' },
          activeHoursStart: scheduleEditor.activeHoursStart || undefined,
          activeHoursEnd: scheduleEditor.activeHoursEnd || undefined,
          createdBy: 'agent-definition',
          enabled: true,
        };
      } else if (scheduleEditor.mode === 'daily') {
        const [h, m] = scheduleEditor.dailyTime.split(':').map(Number);
        const expression = `${m ?? 0} ${h ?? 9} * * *`;
        input = {
          agentInstanceId: previewAgentId,
          agentDefinitionId: agentDefinition.id,
          name: `${agentDefinition.name ?? 'Agent'} daily`,
          scheduleKind: 'cron',
          schedule: { kind: 'cron', expression, timezone: scheduleEditor.timezone },
          payload: { message: scheduleEditor.message || '[Scheduled] Daily check-in. Review your tasks and take any pending actions.' },
          activeHoursStart: scheduleEditor.activeHoursStart || undefined,
          activeHoursEnd: scheduleEditor.activeHoursEnd || undefined,
          createdBy: 'agent-definition',
          enabled: true,
        };
      } else {
        // cron
        input = {
          agentInstanceId: previewAgentId,
          agentDefinitionId: agentDefinition.id,
          name: `${agentDefinition.name ?? 'Agent'} cron`,
          scheduleKind: 'cron',
          schedule: { kind: 'cron', expression: scheduleEditor.cronExpression, timezone: scheduleEditor.timezone || undefined },
          payload: { message: scheduleEditor.message || '[Scheduled] Cron check-in. Review your tasks and take any pending actions.' },
          activeHoursStart: scheduleEditor.activeHoursStart || undefined,
          activeHoursEnd: scheduleEditor.activeHoursEnd || undefined,
          createdBy: 'agent-definition',
          enabled: true,
        };
      }

      if (scheduleEditor.existingTaskId) {
        await service.updateScheduledTask({ id: scheduleEditor.existingTaskId, ...input });
      } else {
        const created = await service.createScheduledTask(input);
        setScheduleEditor(previous => ({ ...previous, existingTaskId: created.id }));
      }
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsScheduleSaving(false);
    }
  }, [agentDefinition, previewAgentId, scheduleEditor]);

  // Load framework config schema
  useEffect(() => {
    const loadSchema = async () => {
      if (!agentDefinition?.agentFrameworkID) {
        // No agentFrameworkID found
        return;
      }

      try {
        // Loading framework config schema
        const schema = await window.service.agentInstance.getFrameworkConfigSchema(agentDefinition.agentFrameworkID);
        // Schema loaded successfully
        setPromptSchema(schema);
      } catch (error) {
        void window.service.native.log('error', 'EditAgentDefinitionContent: Failed to load framework config schema', {
          error,
          agentFrameworkID: agentDefinition.agentFrameworkID,
        });
        console.error('Failed to load framework config schema:', error);
      }
    };

    void loadSchema();
  }, [agentDefinition?.agentFrameworkID]);

  // Auto-save to backend whenever agentDefinition changes (debounced)
  const saveToBackendDebounced = useDebouncedCallback(
    async () => {
      if (!agentDefinition) return;

      try {
        setIsSaving(true);

        // Auto-save agent definition changes

        await window.service.agentDefinition.updateAgentDef(agentDefinition);

        // Agent definition auto-saved successfully
      } catch (error) {
        void window.service.native.log('error', 'Failed to auto-save agent definition', { error, agentDefId: agentDefinition.id });
        console.error('Failed to save agent definition:', error);
      } finally {
        setIsSaving(false);
      }
    },
    [agentDefinition],
    1000,
  );

  useEffect(() => {
    if (agentDefinition) {
      void saveToBackendDebounced();
    }
  }, [agentDefinition, saveToBackendDebounced]);

  // Create preview agent for testing - ensure latest config is saved first
  useEffect(() => {
    const createPreviewAgent = async () => {
      if (!agentDefinition) {
        // No agent definition available
        return;
      }

      // Create preview agent for testing

      try {
        setIsLoading(true);

        // Delete existing preview agent first to ensure we use fresh config
        if (previewAgentId) {
          await window.service.agentInstance.deleteAgent(previewAgentId);
          setPreviewAgentId(null);
        }

        // Flush any pending debounced saves and force save latest config
        await saveToBackendDebounced.flush();
        await window.service.agentDefinition.updateAgentDef(agentDefinition);

        // Create new preview agent
        const agent = await window.service.agentInstance.createAgent(
          agentDefinition.id,
          { preview: true },
        );
        setPreviewAgentId(agent.id);
        // Load any existing scheduled tasks for this agent definition's preview instance
        await loadExistingSchedule(agent.id);

        // Preview agent creation completed
      } catch (error) {
        void window.service.native.log('error', 'EditAgent: Failed to create preview agent', {
          error: error instanceof Error ? error.message : String(error),
          agentDefId: agentDefinition.id,
        });
        console.error('Failed to create preview agent:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // Create or recreate preview agent when definition changes

    // If forceRecreatePreview > 0, recreate immediately; otherwise debounce to avoid too many recreations during typing
    if (forceRecreatePreview > 0) {
      void createPreviewAgent();
    } else {
      // Debounce preview agent creation to avoid too many recreations during typing
      const debounceTimer = setTimeout(() => {
        void createPreviewAgent();
      }, 500);

      return () => {
        clearTimeout(debounceTimer);
      };
    }
  }, [agentDefinition, saveToBackendDebounced, forceRecreatePreview]); // Recreate preview agent when the agent definition changes or when forced to recreate

  // Cleanup preview agent when component unmounts
  useEffect(() => {
    return () => {
      if (previewAgentId) {
        void window.service.agentInstance.deleteAgent(previewAgentId);
      }
    };
  }, [previewAgentId]);

  const handleAgentNameChange = useCallback((name: string) => {
    setAgentName(name);
    setAgentDefinition(previous => previous ? { ...previous, name } : null);
  }, []);

  const handleAgentDescriptionChange = useCallback((description: string) => {
    setAgentDefinition(previous => previous ? { ...previous, description } : null);
  }, []);

  const handlePromptConfigChange = useCallback((formData: unknown) => {
    setAgentDefinition(
      previous => {
        if (!previous) return null;

        return {
          ...previous,
          agentFrameworkConfig: formData as Record<string, unknown>,
        };
      },
    );

    // Force recreate the preview agent to use the new configuration
    setForceRecreatePreview(previous => previous + 1);
  }, []);

  const handleSave = useCallback(async () => {
    if (!agentDefinition) return;

    try {
      setIsLoading(true);

      // Save the final version
      await window.service.agentDefinition.updateAgentDef(agentDefinition);

      // Agent definition saved successfully
    } catch (error) {
      void window.service.native.log('error', 'Failed to save agent definition', { error, agentDefId: agentDefinition.id });
      console.error('Failed to save agent definition:', error);
    } finally {
      setIsLoading(false);
    }
  }, [agentDefinition]);

  if (isLoading && !agentDefinition) {
    return (
      <Container_>
        <Box display='flex' justifyContent='center' alignItems='center' height='100%'>
          <CircularProgress />
          <Typography variant='body1' sx={{ ml: 2 }}>
            {t('EditAgent.Loading')}
          </Typography>
        </Box>
      </Container_>
    );
  }

  if (!agentDefinition) {
    return (
      <Container_>
        <Box display='flex' justifyContent='center' alignItems='center' height='100%'>
          <Typography variant='h6' color='error'>
            {t('EditAgent.AgentNotFound')}
          </Typography>
        </Box>
      </Container_>
    );
  }

  return (
    <Container_>
      <ScrollableContent>
        <Typography variant='h4' gutterBottom>
          {t('EditAgent.Title')}
        </Typography>

        {/* Basic Information Section */}
        <SectionContainer>
          <SectionTitle variant='h6'>
            {t('EditAgent.EditBasic')}
          </SectionTitle>
          <Typography variant='body2' color='text.secondary' gutterBottom>
            {t('EditAgent.EditBasicDescription')}
          </Typography>

          <TextField
            label={t('EditAgent.AgentName')}
            value={agentDefinition?.name || ''}
            onChange={(event) => {
              handleAgentNameChange(event.target.value);
            }}
            margin='normal'
            variant='outlined'
            fullWidth
            placeholder={t('EditAgent.AgentNamePlaceholder')}
            helperText={t('EditAgent.AgentNameHelper')}
            data-testid='edit-agent-name-input'
            slotProps={{
              input: {
                inputProps: {
                  'data-testid': 'edit-agent-name-input-field',
                },
              },
            }}
          />

          <TextField
            label={t('EditAgent.AgentDescription')}
            value={agentDefinition?.description || ''}
            onChange={(event) => {
              handleAgentDescriptionChange(event.target.value);
            }}
            margin='normal'
            variant='outlined'
            fullWidth
            multiline
            minRows={3}
            maxRows={8}
            placeholder={t('EditAgent.AgentDescriptionPlaceholder')}
            helperText={t('EditAgent.AgentDescriptionHelper')}
            data-testid='edit-agent-description-input'
          />
        </SectionContainer>

        {/* Prompt Configuration Section */}
        <SectionContainer>
          <SectionTitle variant='h6'>
            {t('EditAgent.EditPrompt')}
          </SectionTitle>
          <Typography variant='body2' color='text.secondary' gutterBottom>
            {t('EditAgent.EditPromptDescription')}
          </Typography>

          {promptSchema
            ? (
              <Box sx={{ mt: 2 }} data-testid='edit-agent-prompt-form'>
                <PromptConfigForm
                  schema={promptSchema}
                  formData={agentDefinition.agentFrameworkConfig as AgentFrameworkConfig}
                  onChange={handlePromptConfigChange}
                />
              </Box>
            )
            : (
              <Box sx={{ mt: 2 }}>
                <Typography variant='body2' color='text.secondary'>
                  {t('EditAgent.LoadingPromptConfig')}
                </Typography>
              </Box>
            )}
        </SectionContainer>

        <Divider sx={{ my: 3 }} />

        {/* Scheduled Wake-up Section */}
        <SectionContainer data-testid='edit-agent-schedule-section'>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <AccessTimeIcon sx={{ mr: 1, color: 'primary.main' }} />
            <SectionTitle variant='h6' sx={{ mb: 0 }}>
              {t('EditAgent.ScheduledWakeup', 'Scheduled Wake-up')}
            </SectionTitle>
          </Box>
          <Typography variant='body2' color='text.secondary' gutterBottom>
            {t('EditAgent.ScheduledWakeupDescription', 'Configure a recurring schedule to automatically wake this agent and send a reminder message.')}
          </Typography>

          <TextField
            select
            fullWidth
            margin='dense'
            label={t('EditAgent.ScheduleMode', 'Mode')}
            value={scheduleEditor.mode}
            onChange={(event) => {
              setScheduleEditor(previous => ({ ...previous, mode: event.target.value as ScheduleMode }));
            }}
            data-testid='edit-agent-schedule-mode-select'
          >
            <MenuItem value='none'>{t('EditAgent.ScheduleNone', 'None (no scheduled wake-up)')}</MenuItem>
            <MenuItem value='interval'>{t('EditAgent.ScheduleInterval', 'Interval (every N seconds/minutes/hours)')}</MenuItem>
            <MenuItem value='daily'>{t('EditAgent.ScheduleDaily', 'Daily (at a specific time)')}</MenuItem>
            <MenuItem value='cron'>{t('EditAgent.ScheduleCron', 'Advanced cron expression')}</MenuItem>
          </TextField>

          {scheduleEditor.mode === 'interval' && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <TextField
                type='number'
                label={t('EditAgent.ScheduleIntervalValue', 'Every')}
                value={scheduleEditor.intervalValue}
                onChange={(event) => {
                  setScheduleEditor(previous => ({ ...previous, intervalValue: Number.parseInt(event.target.value || '1', 10) }));
                }}
                slotProps={{ htmlInput: { min: 1 } }}
                sx={{ flex: 2 }}
                data-testid='edit-agent-schedule-interval-value'
              />
              <TextField
                select
                label={t('EditAgent.ScheduleIntervalUnit', 'Unit')}
                value={scheduleEditor.intervalUnit}
                onChange={(event) => {
                  setScheduleEditor(previous => ({ ...previous, intervalUnit: event.target.value as IntervalUnit }));
                }}
                sx={{ flex: 1 }}
                data-testid='edit-agent-schedule-interval-unit'
              >
                <MenuItem value='s'>{t('EditAgent.Seconds', 'Seconds')}</MenuItem>
                <MenuItem value='min'>{t('EditAgent.Minutes', 'Minutes')}</MenuItem>
                <MenuItem value='h'>{t('EditAgent.Hours', 'Hours')}</MenuItem>
              </TextField>
            </Box>
          )}

          {scheduleEditor.mode === 'daily' && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <TextField
                type='time'
                label={t('EditAgent.ScheduleDailyTime', 'Wake time')}
                value={scheduleEditor.dailyTime}
                onChange={(event) => {
                  setScheduleEditor(previous => ({ ...previous, dailyTime: event.target.value }));
                }}
                sx={{ flex: 1 }}
                data-testid='edit-agent-schedule-daily-time'
              />
              <TextField
                value={scheduleEditor.timezone}
                label={t('EditAgent.ScheduleTimezone', 'Timezone')}
                onChange={(event) => {
                  setScheduleEditor(previous => ({ ...previous, timezone: event.target.value }));
                }}
                sx={{ flex: 1 }}
                data-testid='edit-agent-schedule-timezone'
              />
            </Box>
          )}

          {scheduleEditor.mode === 'cron' && (
            <Box sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  label={t('EditAgent.ScheduleCronExpr', 'Cron expression')}
                  value={scheduleEditor.cronExpression}
                  onChange={(event) => {
                    setScheduleEditor(previous => ({ ...previous, cronExpression: event.target.value }));
                  }}
                  placeholder='0 9 * * 1-5'
                  helperText={t('EditAgent.ScheduleCronHelp', '5-field cron: min hour day month weekday')}
                  sx={{ flex: 2 }}
                  data-testid='edit-agent-schedule-cron-expr'
                />
                <TextField
                  label={t('EditAgent.ScheduleTimezone', 'Timezone')}
                  value={scheduleEditor.timezone}
                  onChange={(event) => {
                    setScheduleEditor(previous => ({ ...previous, timezone: event.target.value }));
                  }}
                  sx={{ flex: 1 }}
                  data-testid='edit-agent-schedule-cron-timezone'
                />
              </Box>
              {cronPreviewDates.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant='caption' color='text.secondary'>
                    {t('EditAgent.ScheduleCronPreview', 'Next runs:')} {cronPreviewDates.map(d => new Date(d).toLocaleString()).join(' → ')}
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {scheduleEditor.mode !== 'none' && (
            <>
              <TextField
                fullWidth
                multiline
                minRows={2}
                margin='dense'
                label={t('EditAgent.ScheduleMessage', 'Wake-up message')}
                value={scheduleEditor.message}
                onChange={(event) => {
                  setScheduleEditor(previous => ({ ...previous, message: event.target.value }));
                }}
                placeholder={t('EditAgent.ScheduleMessagePlaceholder', '[Scheduled] Periodic check-in. Review your tasks and take any pending actions.')}
                data-testid='edit-agent-schedule-message'
              />
              <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                <TextField
                  type='time'
                  label={t('EditAgent.ActiveHoursStart', 'Active hours start (optional)')}
                  value={scheduleEditor.activeHoursStart}
                  onChange={(event) => {
                    setScheduleEditor(previous => ({ ...previous, activeHoursStart: event.target.value }));
                  }}
                  sx={{ flex: 1 }}
                  data-testid='edit-agent-schedule-active-start'
                />
                <TextField
                  type='time'
                  label={t('EditAgent.ActiveHoursEnd', 'Active hours end (optional)')}
                  value={scheduleEditor.activeHoursEnd}
                  onChange={(event) => {
                    setScheduleEditor(previous => ({ ...previous, activeHoursEnd: event.target.value }));
                  }}
                  sx={{ flex: 1 }}
                  data-testid='edit-agent-schedule-active-end'
                />
              </Box>

              {scheduleError && <Alert severity='error' sx={{ mt: 1 }}>{scheduleError}</Alert>}

              <Tooltip title={!previewAgentId ? t('EditAgent.ScheduleSaveWait', 'Preview agent loading...') : ''} placement='right'>
                <span>
                  <Button
                    variant='outlined'
                    size='small'
                    onClick={() => {
                      void handleSaveSchedule();
                    }}
                    disabled={isScheduleSaving || !previewAgentId}
                    sx={{ mt: 1 }}
                    data-testid='edit-agent-schedule-save-button'
                    startIcon={isScheduleSaving ? <CircularProgress size={14} /> : null}
                  >
                    {isScheduleSaving
                      ? t('EditAgent.ScheduleSaving', 'Saving...')
                      : scheduleEditor.existingTaskId
                      ? t('EditAgent.ScheduleUpdate', 'Update schedule')
                      : t('EditAgent.ScheduleSave', 'Save schedule')}
                  </Button>
                </span>
              </Tooltip>
            </>
          )}
        </SectionContainer>

        <Divider sx={{ my: 3 }} />

        {/* Live Testing Section */}
        <SectionContainer>
          <SectionTitle variant='h6'>
            {t('EditAgent.ImmediateUse')}
          </SectionTitle>
          <Typography variant='body2' color='text.secondary' gutterBottom>
            {t('EditAgent.ImmediateUseDescription')}
          </Typography>

          {previewAgentId && (
            <Box sx={{ height: '400px', border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <ChatTabContent
                tab={{
                  id: previewTabId,
                  type: TabType.CHAT,
                  state: TabState.ACTIVE,
                  title: t('EditAgent.PreviewChat'),
                  agentId: previewAgentId,
                  isPinned: false,
                  createdAt: tabTimestamp,
                  updatedAt: tabTimestamp,
                }}
              />
            </Box>
          )}
        </SectionContainer>
      </ScrollableContent>

      {/* Action Bar */}
      <ActionBar>
        <Button
          variant='contained'
          size='large'
          onClick={handleSave}
          disabled={isLoading || isSaving || !agentName.trim()}
          data-testid='edit-agent-save-button'
          sx={{ minWidth: 200 }}
        >
          {isSaving
            ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                {t('EditAgent.Saving')}
              </>
            )
            : (
              t('EditAgent.Save')
            )}
        </Button>
      </ActionBar>
    </Container_>
  );
};

export default EditAgentDefinitionContent;
