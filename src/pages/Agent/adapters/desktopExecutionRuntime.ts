import { createDesktopAgentExecutionCoordinator } from './DesktopAgentExecutionCoordinator';

async function createExecutionRuntime() {
  const { peerId } = await window.service.deviceNetwork.getLocalIdentity();
  const acceptedCallbacks = new Map<string, () => void | Promise<void>>();
  const coordinator = createDesktopAgentExecutionCoordinator(peerId, {
    onRunAccepted: async ({ requestId }) => {
      const callback = acceptedCallbacks.get(requestId);
      acceptedCallbacks.delete(requestId);
      await callback?.();
    },
  });
  return { peerId, coordinator, acceptedCallbacks };
}

let executionRuntime: ReturnType<typeof createExecutionRuntime> | undefined;

// A run can outlive the tab that started it. Only the renderer owns this coordinator.
export function getDesktopExecutionRuntime() {
  return executionRuntime ??= createExecutionRuntime().catch((error: unknown) => {
    executionRuntime = undefined;
    throw error;
  });
}
