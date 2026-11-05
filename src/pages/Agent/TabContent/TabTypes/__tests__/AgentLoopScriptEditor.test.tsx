import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AgentDefinition } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import { AgentLoopScriptEditor } from '../AgentLoopScriptEditor';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const definition: AgentDefinition = {
  id: 'scripted-agent',
  name: 'Scripted agent',
  description: 'Scripted agent',
  systemPrompt: '',
  tools: [],
  version: '1',
  loopId: 'agent-agent-loop',
  scriptReference: { kind: 'source', source: 'export default function run(ctx) { ctx.finish("first"); }' },
};

describe('AgentLoopScriptEditor', () => {
  it('keeps source edits local until the explicit save action', async () => {
    const onSave = vi.fn(async () => {});
    render(<AgentLoopScriptEditor definition={definition} onSave={onSave} />);
    const source = 'export default function run(ctx) { ctx.finish("edited"); }';
    fireEvent.change(screen.getByLabelText('LoopScript.Source'), { target: { value: source } });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'LoopScript.Save' }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        'agent-agent-loop',
        source,
        expect.objectContaining({
          workers: ['memeloop:general-assistant'],
          reviewers: ['memeloop:general-assistant'],
        }),
      );
    });
    expect(await screen.findByText('LoopScript.Saved')).toBeVisible();
  });

  it('shows a failed save and retains the source for another attempt', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('Storage unavailable')).mockResolvedValueOnce(undefined);
    render(<AgentLoopScriptEditor definition={definition} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'LoopScript.Save' }));
    expect(await screen.findByText('Storage unavailable')).toBeVisible();
    expect(screen.getByLabelText('LoopScript.Source')).toHaveValue(definition.scriptReference?.kind === 'source' ? definition.scriptReference.source : '');
    fireEvent.click(screen.getByRole('button', { name: 'LoopScript.Save' }));
    expect(await screen.findByText('LoopScript.Saved')).toBeVisible();
    expect(screen.queryByText('Storage unavailable')).toBeNull();
  });
});
