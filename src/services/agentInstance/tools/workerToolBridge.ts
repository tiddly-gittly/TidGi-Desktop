export type WorkerBridgeToolHandler = (
  args: Record<string, unknown>,
) => Promise<unknown> | unknown;

const workerBridgeToolHandlers = new Map<string, WorkerBridgeToolHandler>();

export function registerWorkerBridgeTool(toolId: string, handler: WorkerBridgeToolHandler): void {
  workerBridgeToolHandlers.set(toolId, handler);
}

export function listWorkerBridgeTools(): string[] {
  return Array.from(workerBridgeToolHandlers.keys());
}

export async function executeWorkerBridgeTool(
  toolId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const handler = workerBridgeToolHandlers.get(toolId);
  if (!handler) {
    throw new Error(`No worker bridge tool registered for "${toolId}"`);
  }
  return handler(args);
}
