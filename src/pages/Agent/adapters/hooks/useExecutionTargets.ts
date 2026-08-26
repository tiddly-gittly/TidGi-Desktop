import type {
  AgentAttachmentInput,
  AgentRuntimeView,
  ChatMessage,
  Device,
  RemoteAgentExecutionCoordinator,
  RemoteAgentExecutionSnapshot,
  RemoteAgentExecutionTarget,
  WikiTiddlerAttachment,
} from 'memeloop';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createDesktopAgentExecutionCoordinator } from '../DesktopAgentExecutionCoordinator';

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
  agent: AgentRuntimeView | null;
  orderedMessages: readonly ChatMessage[];
}

interface SendExecutionMessageOptions {
  requestId?: string;
  turnId?: string;
  onAccepted?: () => void | Promise<void>;
}

function remoteExecutionTargetId(peerId: string): string {
  return `${REMOTE_EXECUTION_TARGET_PREFIX}${peerId}`;
}

function executionTargetFromId(targetId: string): RemoteAgentExecutionTarget {
  if (targetId === LOCAL_EXECUTION_TARGET_ID) return { kind: 'local' };
  if (targetId.startsWith(REMOTE_EXECUTION_TARGET_PREFIX)) {
    const peerId = targetId.slice(REMOTE_EXECUTION_TARGET_PREFIX.length);
    if (peerId.length > 0) return { kind: 'remote', peerId };
  }
  throw new TypeError('invalid agent execution target');
}

/** Owns device discovery and delegates every mutation to Core's coordinator. */
export function useExecutionTargets({ agent, orderedMessages }: UseExecutionTargetsOptions) {
  const { t } = useTranslation('agent');
  const [localPeerId, setLocalPeerId] = useState<string | undefined>();
  const [agentLoopDevices, setAgentLoopDevices] = useState<Device[]>([]);
  const [activeExecutionTargetId, setActiveExecutionTargetId] = useState(LOCAL_EXECUTION_TARGET_ID);
  const [coordinator, setCoordinator] = useState<RemoteAgentExecutionCoordinator | null>(null);
  const [executionSnapshot, setExecutionSnapshot] = useState<RemoteAgentExecutionSnapshot | null>(null);
  const [discoveryError, setDiscoveryError] = useState<Error | null>(null);
  const activeTargetIdReference = useRef(activeExecutionTargetId);
  const agentIdReference = useRef(agent?.id);
  const acceptedCallbacksReference = useRef(new Map<string, () => void | Promise<void>>());
  const acceptedRequestIdsReference = useRef(new Set<string>());
  activeTargetIdReference.current = activeExecutionTargetId;
  agentIdReference.current = agent?.id;

  useEffect(() => {
    let disposed = false;
    let unsubscribeDevices: (() => void) | undefined;
    let unsubscribeCoordinator: (() => void) | undefined;
    let ownedCoordinator: RemoteAgentExecutionCoordinator | undefined;

    void (async () => {
      try {
        await window.service.deviceNetwork.start();
        const [local, devices] = await Promise.all([
          window.service.deviceNetwork.getLocalDevice(),
          window.service.deviceNetwork.listDevices(),
        ]);
        if (disposed) return;
        const supportsAgentLoop = (device: Device) => device.peerId !== local.peerId && device.trusted && device.capabilities.agentLoop;
        ownedCoordinator = createDesktopAgentExecutionCoordinator(local.peerId, {
          onRunAccepted: async (provenance) => {
            const callback = acceptedCallbacksReference.current.get(provenance.requestId);
            if (!callback) return;
            await callback();
            acceptedRequestIdsReference.current.add(provenance.requestId);
            acceptedCallbacksReference.current.delete(provenance.requestId);
          },
        });
        unsubscribeCoordinator = ownedCoordinator.subscribe((snapshot) => {
          if (!disposed && snapshot.conversationId === agentIdReference.current) setExecutionSnapshot(snapshot);
        });
        setLocalPeerId(local.peerId);
        setAgentLoopDevices(devices.filter(supportsAgentLoop));
        setCoordinator(ownedCoordinator);
        const activeAgentId = agentIdReference.current;
        if (activeAgentId) {
          ownedCoordinator.switchTarget(activeAgentId, executionTargetFromId(activeTargetIdReference.current));
          setExecutionSnapshot(ownedCoordinator.getSnapshot(activeAgentId));
        }
        const subscription = window.observables.deviceNetwork.devices$.subscribe((nextDevices) => {
          if (!disposed) setAgentLoopDevices(nextDevices.filter(supportsAgentLoop));
        });
        unsubscribeDevices = () => {
          subscription.unsubscribe();
        };
      } catch (error) {
        if (!disposed) setDiscoveryError(error instanceof Error ? error : new Error(String(error)));
      }
    })();

    return () => {
      disposed = true;
      unsubscribeDevices?.();
      unsubscribeCoordinator?.();
      const activeAgentId = agentIdReference.current;
      if (ownedCoordinator && activeAgentId) {
        try {
          ownedCoordinator.stopConversation(activeAgentId);
        } catch {
          // Disposal below is the final fence.
        }
      }
      void ownedCoordinator?.dispose();
      acceptedCallbacksReference.current.clear();
      acceptedRequestIdsReference.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!coordinator || !agent?.id) {
      setExecutionSnapshot(null);
      return;
    }
    coordinator.switchTarget(agent.id, executionTargetFromId(activeTargetIdReference.current));
    setExecutionSnapshot(coordinator.getSnapshot(agent.id));
    return () => {
      try {
        coordinator.stopConversation(agent.id);
      } catch {
        // A concurrent hook disposal may already own the final fence.
      }
    };
  }, [agent?.id, coordinator]);

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

  const requireExecutionContext = useCallback(() => {
    if (!agent?.id || !agent.agentDefId) throw new Error(t('Chat.ExecutionTarget.NoActiveAgent'));
    if (!coordinator) throw new Error(t('Chat.ExecutionTarget.NoActiveAgent'));
    return { agent, coordinator };
  }, [agent, coordinator, t]);

  const sendMessage = useCallback(async (
    message: string,
    attachment?: AgentAttachmentInput,
    wikiTiddlers?: readonly WikiTiddlerAttachment[],
    options?: SendExecutionMessageOptions,
  ) => {
    const context = requireExecutionContext();
    const provenance = context.coordinator.prepareProvenance({
      conversationId: context.agent.id,
      definitionId: context.agent.agentDefId,
      ...(options?.requestId === undefined ? {} : { requestId: options.requestId }),
      ...(options?.turnId === undefined ? {} : { turnId: options.turnId }),
    });
    if (options?.onAccepted) acceptedCallbacksReference.current.set(provenance.requestId, options.onAccepted);
    try {
      await context.coordinator.execute({
        target: executionTargetFromId(activeTargetIdReference.current),
        provenance,
        message,
        ...(attachment === undefined ? {} : { attachment }),
        ...(wikiTiddlers === undefined ? {} : { wikiTiddlers }),
      });
    } finally {
      if (!acceptedRequestIdsReference.current.delete(provenance.requestId)) {
        acceptedCallbacksReference.current.delete(provenance.requestId);
      }
    }
  }, [requireExecutionContext]);

  const cancelSelectedTarget = useCallback(async () => {
    const context = requireExecutionContext();
    const current = context.coordinator.getSnapshot(context.agent.id);
    const provenance = current.provenance ?? context.coordinator.prepareProvenance({
      conversationId: context.agent.id,
      definitionId: context.agent.agentDefId,
    });
    await context.coordinator.cancel({
      target: executionTargetFromId(activeTargetIdReference.current),
      provenance,
    });
  }, [requireExecutionContext]);

  const deleteTurn = useCallback(async (turnId: string) => {
    const context = requireExecutionContext();
    await context.coordinator.delete({
      target: executionTargetFromId(activeTargetIdReference.current),
      provenance: context.coordinator.prepareProvenance({
        conversationId: context.agent.id,
        definitionId: context.agent.agentDefId,
        turnId,
      }),
    });
  }, [requireExecutionContext]);

  const retryTurn = useCallback(async (sourceTurnId: string) => {
    const context = requireExecutionContext();
    await context.coordinator.retry({
      target: executionTargetFromId(activeTargetIdReference.current),
      provenance: context.coordinator.prepareProvenance({
        conversationId: context.agent.id,
        definitionId: context.agent.agentDefId,
      }),
      sourceTurnId,
    });
  }, [requireExecutionContext]);

  const setExecutionTarget = useCallback(async (targetId: string, options?: SetExecutionTargetOptions) => {
    if (targetId === activeTargetIdReference.current) return;
    const context = requireExecutionContext();
    const target = executionTargetFromId(targetId);
    const lastUserMessage = [...orderedMessages].reverse().find(message => message.role === 'user');
    if (options?.restartCurrentTurn && lastUserMessage) {
      const current = context.coordinator.getSnapshot(context.agent.id);
      if (current.status === 'queued' || current.status === 'running' || current.status === 'cancelling') {
        await cancelSelectedTarget();
      }
      context.coordinator.switchTarget(context.agent.id, target);
      setActiveExecutionTargetId(targetId);
      await context.coordinator.retry({
        target,
        provenance: context.coordinator.prepareProvenance({
          conversationId: context.agent.id,
          definitionId: context.agent.agentDefId,
        }),
        sourceTurnId: lastUserMessage.turnId,
      });
      return;
    }
    context.coordinator.switchTarget(context.agent.id, target);
    setActiveExecutionTargetId(targetId);
  }, [cancelSelectedTarget, orderedMessages, requireExecutionContext]);

  const status = executionSnapshot?.status ?? 'idle';
  return {
    activeExecutionTargetId,
    cancelSelectedTarget,
    deleteTurn,
    error: executionSnapshot?.error ?? discoveryError,
    executionSnapshot,
    executionTargets,
    isRunning: status === 'queued' || status === 'running' || status === 'cancelling',
    isReady: coordinator !== null && agent?.id !== undefined && agent.agentDefId !== undefined,
    provenance: executionSnapshot?.provenance,
    retryTurn,
    sendMessage,
    setExecutionTarget,
  };
}
