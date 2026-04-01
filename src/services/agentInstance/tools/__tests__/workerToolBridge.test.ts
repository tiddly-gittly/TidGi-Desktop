import { describe, expect, it } from 'vitest';
import { executeWorkerBridgeTool, listWorkerBridgeTools, registerWorkerBridgeTool } from '../workerToolBridge';

describe('workerToolBridge', () => {
  it('registers and executes bridged tools', async () => {
    const toolId = `test-bridge-tool-${Date.now()}`;
    registerWorkerBridgeTool(toolId, async (args) => ({ result: `ok:${String(args.input ?? '')}` }));

    expect(listWorkerBridgeTools()).toContain(toolId);
    await expect(executeWorkerBridgeTool(toolId, { input: '123' })).resolves.toEqual({ result: 'ok:123' });
  });

  it('throws when bridged tool is missing', async () => {
    await expect(executeWorkerBridgeTool('__missing_worker_bridge_tool__', {})).rejects.toThrow(
      'No worker bridge tool registered',
    );
  });
});
