import { PromptPreviewDialog } from '@/pages/Agent/adapters/components/PromptPreviewDialog';
import { createDesktopPromptPreviewController } from '@/pages/Agent/adapters/DesktopPromptPreviewController';
import type { IPossibleWindowMeta, WindowMeta } from '@services/windows/WindowProperties';
import { WindowNames } from '@services/windows/WindowProperties';
import type { PromptPreviewDialogState } from 'memeloop';
import { useEffect, useMemo, useState } from 'react';

export default function PromptPreviewWindow(): React.JSX.Element {
  const [meta, setMeta] = useState(
    () => window.meta() as IPossibleWindowMeta<WindowMeta[WindowNames.promptPreview]>,
  );
  const controller = useMemo(() => createDesktopPromptPreviewController(), []);
  const [state, setState] = useState<PromptPreviewDialogState>(() => controller.getState());

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    return () => {
      unsubscribe();
      controller.close();
    };
  }, [controller]);

  useEffect(() => {
    const handleMetaUpdated = (_event: Electron.IpcRendererEvent, next: IPossibleWindowMeta) => {
      if (next.windowName !== WindowNames.promptPreview) return;
      setMeta(next as IPossibleWindowMeta<WindowMeta[WindowNames.promptPreview]>);
    };
    window.remote.registerWindowMetaUpdated(handleMetaUpdated);
    return () => {
      window.remote.unregisterWindowMetaUpdated(handleMetaUpdated);
    };
  }, []);

  useEffect(() => {
    controller.open(meta.initialBaseMode);
  }, [controller, meta.agentDefinitionId, meta.agentId, meta.initialBaseMode, meta.inputText]);

  return (
    <PromptPreviewDialog
      key={`${meta.agentId}\u0000${meta.agentDefinitionId}\u0000${meta.inputText ?? ''}`}
      agentId={meta.agentId}
      agentDefinitionId={meta.agentDefinitionId}
      state={state}
      controller={controller}
      open={state.open}
      onClose={() => {
        void window.service.window.close(WindowNames.promptPreview);
      }}
      inputText={meta.inputText}
      initialBaseMode={meta.initialBaseMode}
      windowed
    />
  );
}
