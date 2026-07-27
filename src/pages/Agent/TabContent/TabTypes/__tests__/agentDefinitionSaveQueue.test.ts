import type { AgentDefinition } from '@services/agentDefinition/interface';
import { describe, expect, it, vi } from 'vitest';
import { createAgentDefinitionSaveQueue } from '../agentDefinitionSaveQueue';

function definition(name: string): AgentDefinition {
  return { id: 'agent-definition', name } as AgentDefinition;
}

describe('createAgentDefinitionSaveQueue', () => {
  it('does not start a newer save until the previous save finishes', async () => {
    const resolvers: Array<(value: AgentDefinition) => void> = [];
    const saveAgentDefinition = vi.fn((_value: AgentDefinition) =>
      new Promise<AgentDefinition>((resolve) => {
        resolvers.push(resolve);
      })
    );
    const queue = createAgentDefinitionSaveQueue(saveAgentDefinition);
    const older = definition('older');
    const newer = definition('newer');

    const olderSave = queue.save(older);
    const newerSave = queue.save(newer);
    await Promise.resolve();

    expect(saveAgentDefinition).toHaveBeenCalledTimes(1);
    expect(saveAgentDefinition).toHaveBeenNthCalledWith(1, older);

    resolvers[0](older);
    await olderSave;
    await Promise.resolve();

    expect(saveAgentDefinition).toHaveBeenCalledTimes(2);
    expect(saveAgentDefinition).toHaveBeenNthCalledWith(2, newer);

    resolvers[1](newer);
    await expect(newerSave).resolves.toBe(newer);
    await expect(queue.waitForIdle()).resolves.toBeUndefined();
  });

  it('continues with the latest save after an earlier save fails', async () => {
    const saveAgentDefinition = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(definition('newer'));
    const queue = createAgentDefinitionSaveQueue(saveAgentDefinition);

    await expect(queue.save(definition('older'))).rejects.toThrow('temporary failure');
    await expect(queue.save(definition('newer'))).resolves.toMatchObject({ name: 'newer' });
    expect(saveAgentDefinition).toHaveBeenCalledTimes(2);
  });
});
