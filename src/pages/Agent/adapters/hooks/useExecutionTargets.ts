import type { AgentExecutionTarget } from '@memeloop/react-ui/chat';
import type { AgentAttachmentInput, AgentRuntimeView, Device, RemoteAgentExecutionSnapshot, RemoteAgentExecutionTarget, WikiTiddlerAttachment } from 'memeloop';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getDesktopExecutionRuntime } from '../desktopExecutionRuntime';

const LOCAL_EXECUTION_TARGET = Object.freeze({ kind: 'local' } as const satisfies RemoteAgentExecutionTarget);

interface SendExecutionMessageOptions {
  requestId?: string;
  turnId?: string;
  onAccepted?: () => void | Promise<void>;
}

/** Owns device discovery and delegates every mutation to Core's coordinator. */
export function useExecutionTargets(agent: AgentRuntimeView | null) {
  const { t } = useTranslation('agent');
  const [runtime, setRuntime] = useState<Awaited<ReturnType<typeof getDesktopExecutionRuntime>>>();
  const [agentLoopDevices, setAgentLoopDevices] = useState<Device[]>([]);
  const [observedSnapshot, setObservedSnapshot] = useState<RemoteAgentExecutionSnapshot>();
  const [initializationError, setInitializationError] = useState<Error>();
  const agentId = agent?.id;
  const executionSnapshot = observedSnapshot?.conversationId === agentId ? observedSnapshot : undefined;
  const activeExecutionTarget = executionSnapshot?.target ?? LOCAL_EXECUTION_TARGET;

  useEffect(() => {
    let subscribed = true;
    void getDesktopExecutionRuntime().then(settled => {
      if (subscribed) setRuntime(settled);
    }, (error: unknown) => {
      if (subscribed) setInitializationError(error instanceof Error ? error : new Error(String(error)));
    });
    return () => {
      subscribed = false;
    };
  }, []);

  useEffect(() => {
    if (!runtime) return;
    const subscription = window.observables.deviceNetwork.devices$.subscribe(devices => {
      setAgentLoopDevices(devices.filter(device => device.peerId !== runtime.peerId && device.trusted && device.capabilities.agentLoop));
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [runtime]);

  useEffect(() => {
    if (!runtime || !agentId) return;
    setObservedSnapshot(runtime.coordinator.getSnapshot(agentId));
    return runtime.coordinator.subscribe(snapshot => {
      if (snapshot.conversationId === agentId) setObservedSnapshot(snapshot);
    });
  }, [agentId, runtime]);

  const executionTargets = useMemo<AgentExecutionTarget[]>(() => [
    {
      value: LOCAL_EXECUTION_TARGET,
      label: t('Chat.ExecutionTarget.ThisDevice'),
      description: runtime
        ? t('Chat.ExecutionTarget.RunOnThisDesktopWithPeerId', { peerId: runtime.peerId })
        : t('Chat.ExecutionTarget.RunOnThisDesktop'),
    },
    ...agentLoopDevices.map(device => ({
      value: { kind: 'remote' as const, peerId: device.peerId },
      label: device.displayName,
      description: t('Chat.ExecutionTarget.RemoteDeviceDescription', {
        platform: t(`Chat.ExecutionTarget.Platform.${device.platform}`),
        reachability: t(`Chat.ExecutionTarget.Reachability.${device.reachability.state}`),
      }),
    })),
  ], [agentLoopDevices, runtime, t]);

  const requireExecutionContext = useCallback(() => {
    if (!agent?.id || !agent.agentDefId || !runtime) throw new Error(t('Chat.ExecutionTarget.NoActiveAgent'));
    return { agent, ...runtime, snapshot: runtime.coordinator.getSnapshot(agent.id) };
  }, [agent, runtime, t]);

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
    if (options?.onAccepted) context.acceptedCallbacks.set(provenance.requestId, options.onAccepted);
    try {
      await context.coordinator.execute({
        target: context.snapshot.target ?? LOCAL_EXECUTION_TARGET,
        provenance,
        message,
        ...(attachment === undefined ? {} : { attachment }),
        ...(wikiTiddlers === undefined ? {} : { wikiTiddlers }),
      });
    } finally {
      context.acceptedCallbacks.delete(provenance.requestId);
    }
  }, [requireExecutionContext]);

  const cancelSelectedTarget = useCallback(async () => {
    const context = requireExecutionContext();
    const provenance = context.snapshot.provenance ?? context.coordinator.prepareProvenance({
      conversationId: context.agent.id,
      definitionId: context.agent.agentDefId,
    });
    await context.coordinator.cancel({
      target: context.snapshot.target ?? LOCAL_EXECUTION_TARGET,
      provenance,
    });
  }, [requireExecutionContext]);

  const deleteTurn = useCallback(async (turnId: string) => {
    const context = requireExecutionContext();
    await context.coordinator.delete({
      target: context.snapshot.target ?? LOCAL_EXECUTION_TARGET,
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
      target: context.snapshot.target ?? LOCAL_EXECUTION_TARGET,
      provenance: context.coordinator.prepareProvenance({
        conversationId: context.agent.id,
        definitionId: context.agent.agentDefId,
      }),
      sourceTurnId,
    });
  }, [requireExecutionContext]);

  const setExecutionTarget = useCallback(async (target: RemoteAgentExecutionTarget) => {
    const context = requireExecutionContext();
    const { snapshot } = context;
    if (!isExecutionInProgress(snapshot) && !executionTargetsEqual(target, snapshot.target ?? LOCAL_EXECUTION_TARGET)) {
      context.coordinator.switchTarget(context.agent.id, target);
    }
  }, [requireExecutionContext]);

  return {
    activeExecutionTarget,
    cancelSelectedTarget,
    deleteTurn,
    error: executionSnapshot?.error ?? initializationError,
    executionSnapshot,
    executionTargets,
    isRunning: isExecutionInProgress(executionSnapshot),
    isReady: executionSnapshot !== undefined && agent?.agentDefId !== undefined,
    provenance: executionSnapshot?.provenance,
    retryTurn,
    sendMessage,
    setExecutionTarget,
  };
}

function isExecutionInProgress(snapshot: RemoteAgentExecutionSnapshot | undefined): boolean {
  const status = snapshot?.status;
  return status === 'queued' || status === 'running' || status === 'cancelling';
}

function executionTargetsEqual(left: RemoteAgentExecutionTarget, right: RemoteAgentExecutionTarget): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind === 'local' || (right.kind === 'remote' && left.peerId === right.peerId);
}
