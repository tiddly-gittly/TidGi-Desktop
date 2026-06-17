// Attachment and dialog state hook for chat interface
import type { WikiTiddlerAttachment } from 'memeloop';
import { useCallback, useState } from 'react';

/**
 * Custom hook for managing chat attachment state and model parameter dialog.
 * Message sending is handled by the upstream MemeLoopChatAdapter —
 * this hook only manages UI-level state local to the chat tab.
 */
export function useMessageHandling() {
  const [selectedFile, setSelectedFile] = useState<File | undefined>();
  const [selectedWikiTiddlers, setSelectedWikiTiddlers] = useState<WikiTiddlerAttachment[]>([]);
  const [parametersOpen, setParametersOpen] = useState(false);

  const handleOpenParameters = useCallback(() => {
    setParametersOpen(true);
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
  }, []);

  const handleClearFile = useCallback(() => {
    setSelectedFile(undefined);
  }, []);

  const handleWikiTiddlerSelect = useCallback((tiddler: WikiTiddlerAttachment) => {
    setSelectedWikiTiddlers(previous => [...previous, tiddler]);
  }, []);

  const handleRemoveWikiTiddler = useCallback((index: number) => {
    setSelectedWikiTiddlers(previous => previous.filter((_, index_) => index_ !== index));
  }, []);

  const clearAttachments = useCallback(() => {
    setSelectedFile(undefined);
    setSelectedWikiTiddlers([]);
  }, []);

  return {
    parametersOpen,
    setParametersOpen,
    handleOpenParameters,
    selectedFile,
    handleFileSelect,
    handleClearFile,
    selectedWikiTiddlers,
    handleWikiTiddlerSelect,
    handleRemoveWikiTiddler,
    clearAttachments,
  };
}
