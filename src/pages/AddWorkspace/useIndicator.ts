import { useState, useEffect } from 'react';

export function useWikiCreationProgress(wikiCreationMessage?: string, hasError?: boolean): [boolean, React.Dispatch<React.SetStateAction<boolean>>, boolean] {
  const [logPanelOpened, logPanelSetter] = useState<boolean>(false);
  const [progressBarOpen, progressBarOpenSetter] = useState<boolean>(false);
  useEffect(() => {
    const creationInProgress = wikiCreationMessage !== undefined && wikiCreationMessage.length > 0 && hasError !== true;
    if (creationInProgress) {
      logPanelSetter(true);
      progressBarOpenSetter(true);
    }
    if (hasError === true) {
      logPanelSetter(false);
      progressBarOpenSetter(false);
    }
  }, [wikiCreationMessage, hasError]);
  return [logPanelOpened, logPanelSetter, progressBarOpen];
}
