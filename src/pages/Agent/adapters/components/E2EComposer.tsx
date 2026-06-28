import { MemeLoopComposer, type MemeLoopComposerProps } from '@memeloop/react-ui/chat';
import { useAui } from '@memeloop/react-ui/chat';
import React, { useEffect, useRef } from 'react';

/**
 * E2EComposer — wraps MemeLoopComposer and marks its editable input with
 * data-testid="agent-message-input" so existing Cucumber scenarios can locate
 * the chat input.
 *
 * It also bridges the Enter key to the composer's send action. Playwright's
 * global keyboard.press('Enter') does not reliably trigger assistant-ui's
 * internal keydown handler inside the packaged Electron app, so we attach a
 * direct keydown listener that mirrors the gating logic used by
 * ComposerPrimitive.Input.
 */
export const E2EComposer: React.FC<MemeLoopComposerProps> = (props) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const aui = useAui();

  useEffect(() => {
    const input = rootRef.current?.querySelector('.assistant-ui-composer-input');
    if (input instanceof HTMLElement) {
      input.setAttribute('data-testid', 'agent-message-input');
    }
  });

  useEffect(() => {
    const input = rootRef.current?.querySelector('.assistant-ui-composer-input');
    if (!(input instanceof HTMLElement)) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      const composerState = aui.composer().getState();
      const threadState = aui.thread().getState();
      if (composerState.isEditing && composerState.canSend && !threadState.isRunning) {
        event.preventDefault();
        event.stopPropagation();
        aui.composer().send();
      }
    };

    input.addEventListener('keydown', handler);
    return () => {
      input.removeEventListener('keydown', handler);
    };
  }, [aui]);

  return (
    <div ref={rootRef} style={{ display: 'contents' }}>
      <MemeLoopComposer {...props} />
    </div>
  );
};
