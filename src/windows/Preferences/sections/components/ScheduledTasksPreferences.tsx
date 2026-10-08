import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AddIcon from '@mui/icons-material/Add';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, TextField, Typography } from '@mui/material';
import type { AgentDefinition } from 'memeloop';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ScheduledWakeupEditor } from '@/pages/Agent/TabContent/TabTypes/ScheduledWakeupEditor';
import { getDefaultAgentDefinitionId } from '@/services/agentDefinition/defaults';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Preferences entry point for durable scheduled tasks.
 *
 * Scheduling validation, paging, remote-source fencing and mutations stay in
 * the shared ScheduledTaskEditor. Preferences only chooses the definition and
 * hosts that editor in a dialog, so Desktop does not grow a second scheduler.
 */
export function ScheduledTasksPreferences(): React.JSX.Element {
  const { t } = useTranslation('agent');
  const [open, setOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [definitions, setDefinitions] = useState<AgentDefinition[]>([]);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState('');

  const selectedDefinition = useMemo(
    () => definitions.find(definition => definition.id === selectedDefinitionId),
    [definitions, selectedDefinitionId],
  );

  const loadDefinitions = useCallback(async () => {
    setLoadState('loading');
    try {
      const loaded = await window.service.agentDefinition.getAgentDefs();
      const definitionsWithIds = loaded.filter(definition => Boolean(definition.id));
      const defaultDefinitionId = getDefaultAgentDefinitionId();
      const nextSelectedId = definitionsWithIds.some(definition => definition.id === selectedDefinitionId)
        ? selectedDefinitionId
        : definitionsWithIds.find(definition => definition.id === defaultDefinitionId)?.id ?? definitionsWithIds[0]?.id ?? '';
      setDefinitions(definitionsWithIds);
      setSelectedDefinitionId(nextSelectedId);
      setLoadState('ready');
    } catch (error) {
      setLoadState('error');
      void window.service.native.log('error', 'ScheduledTasksPreferences: failed to load agent definitions', {
        function: 'ScheduledTasksPreferences.loadDefinitions',
        error,
      });
    }
  }, [selectedDefinitionId]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    void loadDefinitions();
  }, [loadDefinitions]);

  return (
    <>
      <Divider />
      <Box data-testid='scheduled-tasks-settings'>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 1.5, pb: 0.5 }}>
          <AccessTimeIcon fontSize='small' color='action' />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant='subtitle2'>{t('Preference.BackgroundTasks')}</Typography>
            <Typography variant='body2' color='text.secondary'>{t('Preference.BackgroundTasksDescription')}</Typography>
          </Box>
          <Button
            size='small'
            startIcon={<AddIcon />}
            onClick={handleOpen}
            data-testid='scheduled-task-add-button'
          >
            {t('EditAgent.ScheduleNewTask')}
          </Button>
        </Box>
      </Box>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        maxWidth='md'
        fullWidth
        data-testid='scheduled-task-dialog'
      >
        <DialogTitle>{t('Preference.BackgroundTasks')}</DialogTitle>
        <DialogContent dividers>
          {loadState === 'loading' && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress size={28} />
            </Box>
          )}
          {loadState === 'error' && <Alert severity='error'>{t('EditAgent.ScheduleOperationFailed')}</Alert>}
          {loadState === 'ready' && definitions.length === 0 && <Alert severity='info'>{t('EditAgent.ScheduleConversationRequired')}</Alert>}
          {loadState === 'ready' && definitions.length > 0 && (
            <>
              <TextField
                select
                fullWidth
                size='small'
                label={t('Chat.Actions.Agent')}
                value={selectedDefinitionId}
                onChange={event => {
                  setSelectedDefinitionId(event.target.value);
                }}
                data-testid='scheduled-task-agent-definition-select'
                sx={{ mb: 2 }}
              >
                {definitions.map(definition => <MenuItem key={definition.id} value={definition.id}>{definition.name || definition.id}</MenuItem>)}
              </TextField>
              {selectedDefinition && <ScheduledWakeupEditor agentDefinition={selectedDefinition} />}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOpen(false);
            }}
            data-testid='scheduled-task-cancel-button'
          >
            {t('Cancel', { ns: 'translation' })}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
