import { useState, useEffect } from 'react';

export default function useWikiCreationMessage(wikiCreationMessage: string): [boolean, boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const hasError = wikiCreationMessage.startsWith('Error');
  const [snackBarOpen, snackBarOpenSetter] = useState<boolean>(false);
  const [progressBarOpen, progressBarOpenSetter] = useState<boolean>(false);
  useEffect(() => {
    const creationInProgress = wikiCreationMessage.length > 0 && !hasError;
    if (creationInProgress) {
      snackBarOpenSetter(true);
      progressBarOpenSetter(true);
    }
    if (hasError) {
      snackBarOpenSetter(false);
      progressBarOpenSetter(false);
    }
  }, [wikiCreationMessage, hasError]);
  return [snackBarOpen, progressBarOpen, snackBarOpenSetter];
}
