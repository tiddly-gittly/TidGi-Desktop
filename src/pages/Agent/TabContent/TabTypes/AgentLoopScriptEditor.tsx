import { AgentLoopScriptEditor as SharedAgentLoopScriptEditor } from '@memeloop/react-ui/web';
import type { AgentDefinition } from 'memeloop';
import { useTranslation } from 'react-i18next';

export function AgentLoopScriptEditor(props: { definition: AgentDefinition; onSave: (loopId: string, source: string, metadata: Record<string, unknown>) => Promise<void> }) {
  const { t } = useTranslation('agent');
  return (
    <SharedAgentLoopScriptEditor
      {...props}
      labels={{
        title: t('LoopScript.Title'),
        description: t('LoopScript.Description'),
        family: t('LoopScript.Family'),
        toolLoop: t('LoopScript.ToolLoop'),
        agentLoop: t('LoopScript.AgentLoop'),
        source: t('LoopScript.Source'),
        metadata: t('LoopScript.Metadata'),
        invalidMetadata: t('LoopScript.InvalidMetadata'),
        save: t('LoopScript.Save'),
        saved: t('LoopScript.Saved'),
      }}
    />
  );
}
