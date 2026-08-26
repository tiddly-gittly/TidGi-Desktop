import { ScheduledTaskEditor, type ScheduledTaskExecutionTarget } from '@memeloop/react-ui/agent/scheduling';
import { Alert, Box, CircularProgress, MenuItem, TextField } from '@mui/material';
import type { AgentDefinition, ConversationMeta } from 'memeloop';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createDesktopScheduledTaskClient } from '@/pages/Agent/adapters/DesktopScheduledTaskClient';
import { resolveScheduledTaskLocale } from '@/pages/Agent/TabContent/TabTypes/scheduledTaskLocales';

interface ScheduledWakeupEditorProps {
  agentDefinition: AgentDefinition;
}

/**
 * Desktop binding for the upstream cron editor. Scheduling rules, validation,
 * device display and responsive UI live in @memeloop/react-ui; this component
 * only supplies IPC and localized labels.
 */
export function ScheduledWakeupEditor({ agentDefinition }: ScheduledWakeupEditorProps) {
  const { i18n, t } = useTranslation('agent');
  const client = useMemo(() => createDesktopScheduledTaskClient(), []);
  const [localNodeId, setLocalNodeId] = useState<string>();
  const [conversations, setConversations] = useState<readonly ConversationMeta[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>();
  const [executionTargets, setExecutionTargets] = useState<ScheduledTaskExecutionTarget[]>([]);
  const [identityState, setIdentityState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const scheduleLocale = useMemo(
    () => resolveScheduledTaskLocale(i18n.resolvedLanguage ?? i18n.language ?? 'en'),
    [i18n.language, i18n.resolvedLanguage],
  );

  useEffect(() => {
    const deviceNetwork = window.service.deviceNetwork;
    let cancelled = false;
    setIdentityState('loading');
    setLocalNodeId(undefined);
    setExecutionTargets([]);
    void Promise.resolve().then(async () => {
      if (!deviceNetwork) throw new Error('device_network_unavailable');
      const identity = await deviceNetwork.getLocalIdentity();
      const [devices, conversationPage] = await Promise.all([
        deviceNetwork.listDevices(),
        window.service.agentInstance.getAgentConversationListPage(identity.peerId, {
          limit: 32,
          maxBytes: 256 * 1024,
          query: { definitionId: agentDefinition.id },
        }),
      ]);
      if (conversationPage.reset) throw new Error('conversation_directory_reset');
      const selectedConversation = conversationPage.items.find(item => item.conversationId === selectedConversationId) ??
        conversationPage.items[0];
      const projectionPage = selectedConversation
        ? await window.service.agentInstance.listRemoteScheduledTaskProjectionPageForAgent({
          agentInstanceId: selectedConversation.conversationId,
          states: ['active', 'paused'],
          limit: 32,
        })
        : { items: [], revision: '0' };
      return { identity, devices, conversationPage, selectedConversation, projectionPage };
    }).then(({ identity, devices, conversationPage, selectedConversation, projectionPage }) => {
      if (cancelled) return;
      const targets: ScheduledTaskExecutionTarget[] = [
        { id: identity.peerId, label: t('Chat.ExecutionTarget.ThisDevice') },
        ...devices
          .filter(device => device.peerId !== identity.peerId)
          .map(device => ({
            id: device.peerId,
            label: device.reachability.state === 'offline'
              ? `${device.displayName || device.peerId} · ${t('Chat.ExecutionTarget.Reachability.offline')}`
              : device.displayName || device.peerId,
            disabled: !device.trusted || device.reachability.state === 'offline',
          })),
      ];
      const knownTargetIds = new Set(targets.map(target => target.id));
      for (const projection of projectionPage.items) {
        const task = projection.task;
        if (knownTargetIds.has(task.executionNodeId)) continue;
        targets.push({
          id: task.executionNodeId,
          label: `${task.executionNodeLabel || task.executionNodeId} · ${t('Chat.ExecutionTarget.Reachability.offline')}`,
          disabled: true,
        });
        knownTargetIds.add(task.executionNodeId);
      }
      setLocalNodeId(identity.peerId);
      setConversations(conversationPage.items);
      setSelectedConversationId(selectedConversation?.conversationId);
      setExecutionTargets(targets);
      setIdentityState(selectedConversation ? 'ready' : 'empty');
    }).catch(() => {
      if (cancelled) return;
      setIdentityState('error');
    });
    return () => {
      cancelled = true;
    };
  }, [agentDefinition.id, selectedConversationId, t]);

  if (identityState !== 'ready' || !localNodeId) {
    return (
      <Box sx={{ p: 3, mb: 4 }} data-testid='edit-agent-schedule-identity-state'>
        {identityState === 'loading'
          ? <Alert icon={<CircularProgress size={18} />} severity='info'>{t('EditAgent.ScheduleIdentityLoading')}</Alert>
          : identityState === 'empty'
          ? <Alert severity='info'>{t('EditAgent.ScheduleConversationRequired')}</Alert>
          : <Alert severity='error'>{t('EditAgent.ScheduleIdentityError')}</Alert>}
      </Box>
    );
  }

  return (
    <Box>
      {conversations.length > 1 && (
        <TextField
          select
          fullWidth
          size='small'
          label={t('EditAgent.ScheduleConversation')}
          value={selectedConversationId ?? ''}
          onChange={event => {
            setSelectedConversationId(event.target.value);
          }}
          sx={{ mb: 2 }}
        >
          {conversations.map(conversation => (
            <MenuItem key={conversation.conversationId} value={conversation.conversationId}>
              {conversation.title || conversation.conversationId}
            </MenuItem>
          ))}
        </TextField>
      )}
      <ScheduledTaskEditor
        agentDefinition={agentDefinition}
        agentInstanceId={selectedConversationId ?? null}
        client={client}
        executionTargets={executionTargets}
        localNodeId={localNodeId}
        locale={scheduleLocale.cronLocale}
        customLocale={scheduleLocale.customLocale}
        dateLocale={scheduleLocale.dateLocale}
        labels={{
          title: t('EditAgent.ScheduledWakeup'),
          description: t('EditAgent.ScheduledWakeupDescription'),
          disabled: t('EditAgent.ScheduleNone'),
          enabled: t('EditAgent.ScheduleCron'),
          executionTarget: t('EditAgent.ScheduleExecutionTarget'),
          timezone: t('EditAgent.ScheduleTimezone'),
          message: t('EditAgent.ScheduleMessage'),
          activeHoursStart: t('EditAgent.ActiveHoursStart'),
          activeHoursEnd: t('EditAgent.ActiveHoursEnd'),
          save: t('EditAgent.ScheduleSave'),
          update: t('EditAgent.ScheduleUpdate'),
          saving: t('EditAgent.ScheduleSaving'),
          taskSelection: t('EditAgent.ScheduleTaskSelection'),
          newTask: t('EditAgent.ScheduleNewTask'),
          scheduleTitle: t('EditAgent.ScheduleCron'),
          executionTargetUnavailable: t('EditAgent.ScheduleExecutionTargetUnavailable'),
          preview: t('EditAgent.ScheduleCronPreview'),
          previewLoading: t('EditAgent.SchedulePreviewLoading'),
          invalidCron: t('EditAgent.ScheduleInvalidCron'),
          invalidTimezone: t('EditAgent.ScheduleInvalidTimezone'),
          noPreview: t('EditAgent.ScheduleNoPreview'),
          operationFailed: t('EditAgent.ScheduleOperationFailed'),
          sourceIncomplete: t('EditAgent.ScheduleSourceIncomplete'),
          sourceOnline: executionTarget => t('EditAgent.ScheduleSourceOnline', { executionTarget }),
          sourceOffline: executionTarget => t('EditAgent.ScheduleSourceOffline', { executionTarget }),
          sourceDegraded: executionTarget => t('EditAgent.ScheduleSourceDegraded', { executionTarget }),
          sourceCached: executionTarget => t('EditAgent.ScheduleSourceCached', { executionTarget }),
          defaultTaskName: agentName => t('EditAgent.ScheduleDefaultTaskName', { agentName }),
          defaultMessage: t('EditAgent.ScheduleMessagePlaceholder'),
        }}
      />
    </Box>
  );
}
