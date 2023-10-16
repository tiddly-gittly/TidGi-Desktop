/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { WikiChannel } from '@/constants/channels';
import { useEffect, useState } from 'react';

/**
 * Render string to HTML, regeared the string as in wiki text syntax
 */
export function useRenderWikiText(wikiText: string, workspaceID?: string): string {
  const [renderedText, renderedTextSetter] = useState<string>('');
  useEffect(() => {
    if (!wikiText) {
      renderedTextSetter('');
      return;
    }
    const render = async () => {
      // TidGi only: try to use wiki to render wiki text (instead of markdown currently)
      // this hook might be used in env that wiki services is not available, so need to check first
      try {
        if (window.service?.wiki?.wikiOperationInBrowser !== undefined) {
          let workspaceIDToUse = workspaceID;
          if (workspaceIDToUse === undefined) {
            workspaceIDToUse = await window.service?.workspace?.getActiveWorkspace?.()?.then(async (activeWorkspace) => {
              if (activeWorkspace === undefined) {
                const workspaceList = await window.service?.workspace?.getWorkspacesAsList?.();
                activeWorkspace = workspaceList?.[0];
              }
              if (activeWorkspace === undefined) {
                return;
              }
              return activeWorkspace.id;
            });
          }
          if (workspaceIDToUse === undefined) {
            return;
          }
          const renderedResultText = await window.service.wiki.wikiOperationInBrowser(WikiChannel.renderWikiText, workspaceIDToUse, [wikiText]);
          renderedTextSetter(renderedResultText ?? '');
        }
      } catch (error) {
        console.error(error);
        renderedTextSetter('');
      }
    };
    void render();
  }, [wikiText, workspaceID]);
  return renderedText;
}
