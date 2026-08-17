import type { ChatMessage, Device } from 'memeloop';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AgentWithoutMessages } from '../../store/agentChatStore/types';

const LOCAL_EXECUTION_TARGET_ID = 'local';
const REMOTE_EXECUTION_TARGET_PREFIX = 'peer:';

export interface AgentExecutionTarget {
  id: string;
  label: string;
  description?: string;
  kind?: 'local' | 'remote';
  disabled?: boolean;
}

interface SetExecutionTargetOptions {
  restartCurrentTurn?: boolean;
}

interface UseExecutionTargetsOptions {
  agent: AgentWithoutMessages | null;
  tabTitle: string;
  orderedMessages: ChatMessage[];
  cancelLocalAgent: () => Promise<void>;
  deleteTurn: (userMessageId: string) => Promise<string | undefined>;
  fetchAgent: (agentId: string) => Promise<void>;
  sendLocalMessage: (content: string, file?: File, wikiTiddlers?: Array<{ workspaceName: string; tiddlerTitle: string }>) => Promise<void>;
}

function remoteExecutionTargetId(peerId: string): string {
  return `${REMOTE_EXECUTION_TARGET_PREFIX}${peerId}`;
}

function peerIdFromExecutionTarget(targetId: string): string | undefined {
  return targetId.startsWith(REMOTE_EXECUTION_TARGET_PREFIX) ? targetId.slice(REMOTE_EXECUTION_TARGET_PREFIX.length) : undefined;
}

/** Owns device discovery and all local/remote execution-target transitions. */
export function useExecutionTargets({
  agent,
  cancelLocalAgent,
  deleteTurn,
  fetchAgent,
  orderedMessages,
  sendLocalMessage,
  tabTitle,
}: UseExecutionTargetsOptions) {
  const { t } = useTranslation('agent');
  const [localPeerId, setLocalPeerId] = useState<string | undefined>();
  const [agentLoopDevices, setAgentLoopDevices] = useState<Device[]>([]);
  const [activeExecutionTargetId, setActiveExecutionTargetId] = useState(LOCAL_EXECUTION_TARGET_ID);
  const [remoteRunning, setRemoteRunning] = useState(false);
  const [remoteError, setRemoteError] = useState<Error | null>(null);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      try {
        await window.service.deviceNetwork.start();
        const [local, devices] = await Promise.all([
          window.service.deviceNetwork.getLocalDevice(),
          window.service.deviceNetwork.listDevices(),
        ]);
        if (disposed) return;
        const supportsAgentLoop = (device: Device) => device.peerId !== local.peerId && device.trusted && device.capabilities.agentLoop;
        setLocalPeerId(local.peerId);
        setAgentLoopDevices(devices.filter(supportsAgentLoop));
        const subscription = window.observables.deviceNetwork.devices$.subscribe((nextDevices) => {
          if (!disposed) setAgentLoopDevices(nextDevices.filter(supportsAgentLoop));
        });
        unsubscribe = () => {
          subscription.unsubscribe();
        };
      } catch (error) {
        if (!disposed) setRemoteError(error instanceof Error ? error : new Error(String(error)));
      }
    })();

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  const executionTargets = useMemo<AgentExecutionTarget[]>(() => [
    {
      id: LOCAL_EXECUTION_TARGET_ID,
      label: t('Chat.ExecutionTarget.ThisDevice'),
      description: localPeerId
        ? t('Chat.ExecutionTarget.RunOnThisDesktopWithPeerId', { peerId: localPeerId })
        : t('Chat.ExecutionTarget.RunOnThisDesktop'),
      kind: 'local',
    },
    ...agentLoopDevices.map(device => ({
      id: remoteExecutionTargetId(device.peerId),
      label: device.displayName,
      description: t('Chat.ExecutionTarget.RemoteDeviceDescription', {
        platform: t(`Chat.ExecutionTarget.Platform.${device.platform}`),
        reachability: t(`Chat.ExecutionTarget.Reachability.${device.reachability.state}`),
      }),
      kind: 'remote' as const,
      disabled: !device.trusted,
    })),
  ], [agentLoopDevices, localPeerId, t]);

  const sendRemoteMessage = useCallback(async (peerId: string, text: string) => {
    if (!agent?.id) throw new Error(t('Chat.ExecutionTarget.NoActiveAgent'));
    setRemoteRunning(true);
    setRemoteError(null);
    try {
      await window.service.deviceNetwork.sendRpc(peerId, 'memeloop.agent.runTurn', {
        conversationId: agent.id,
        definitionId: agent.agentDefId,
        message: text,
        resumeSession: orderedMessages,
        conversation: {
          conversationId: agent.id,
          title: agent.name || tabTitle,
          lastMessagePreview: text,
          lastMessageTimestamp: Date.now(),
          messageCount: orderedMessages.length,
          originNodeId: localPeerId ?? 'tidgi-desktop',
          definitionId: agent.agentDefId,
          isUserInitiated: true,
        },
      });
      await window.service.deviceNetwork.syncWithDevice(peerId);
      await fetchAgent(agent.id);
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(String(error));
      setRemoteError(nextError);
      throw nextError;
    } finally {
      setRemoteRunning(false);
    }
  }, [agent?.agentDefId, agent?.id, agent?.name, fetchAgent, localPeerId, orderedMessages, t, tabTitle]);

  const cancelSelectedTarget = useCallback(async () => {
    const peerId = peerIdFromExecutionTarget(activeExecutionTargetId);
    if (peerId && agent?.id) {
      await window.service.deviceNetwork.sendRpc(peerId, 'memeloop.agent.cancel', { conversationId: agent.id }).catch((error: unknown) => {
        void window.service.native.log('warn', 'Remote agent cancel failed', { peerId, error });
      });
      setRemoteRunning(false);
      return;
    }
    await cancelLocalAgent();
  }, [activeExecutionTargetId, agent?.id, cancelLocalAgent]);

  const setExecutionTarget = useCallback(async (targetId: string, options?: SetExecutionTargetOptions) => {
    if (targetId === activeExecutionTargetId) return;
    if (!options?.restartCurrentTurn) {
      setActiveExecutionTargetId(targetId);
      return;
    }

    const lastUserMessage = [...orderedMessages].reverse().find(message => message.role === 'user');
    await cancelSelectedTarget();
    setActiveExecutionTargetId(targetId);
    if (!lastUserMessage) return;
    await deleteTurn(lastUserMessage.messageId);
    const peerId = peerIdFromExecutionTarget(targetId);
    if (peerId) {
      await sendRemoteMessage(peerId, lastUserMessage.content);
      return;
    }
    await sendLocalMessage(lastUserMessage.content);
  }, [activeExecutionTargetId, cancelSelectedTarget, deleteTurn, orderedMessages, sendLocalMessage, sendRemoteMessage]);

  const loadMessageDetail = useCallback(async (message: ChatMessage) => {
    if (!message.detailRef) return null;
    const targetPeerId = message.detailRef.nodeId;
    const targetConversationId = message.detailRef.conversationId ?? message.conversationId;
    if (!targetPeerId || targetPeerId === localPeerId) {
      return orderedMessages.filter(item => item.conversationId === targetConversationId);
    }
    const result = await window.service.deviceNetwork.sendRpc<{ messages: ChatMessage[] }>(targetPeerId, 'memeloop.chat.pullAgentRunLog', {
      conversationId: targetConversationId,
      knownMessageIds: orderedMessages.map(item => item.messageId),
    });
    await window.service.deviceNetwork.syncWithDevice(targetPeerId).catch((error: unknown) => {
      void window.service.native.log('warn', 'DetailRef follow-up sync failed', { peerId: targetPeerId, error });
    });
    if (agent?.id) await fetchAgent(agent.id);
    return result.messages;
  }, [agent?.id, fetchAgent, localPeerId, orderedMessages]);

  const sendMessage = useCallback(async (
    text: string,
    file?: File,
    wikiTiddlers?: Array<{ workspaceName: string; tiddlerTitle: string }>,
  ) => {
    const peerId = peerIdFromExecutionTarget(activeExecutionTargetId);
    if (peerId) {
      await sendRemoteMessage(peerId, text);
    } else {
      await sendLocalMessage(text, file, wikiTiddlers);
    }
  }, [activeExecutionTargetId, sendLocalMessage, sendRemoteMessage]);

  return {
    activeExecutionTargetId,
    cancelSelectedTarget,
    executionTargets,
    loadMessageDetail,
    remoteError,
    remoteRunning,
    sendMessage,
    setExecutionTarget,
  };
}
