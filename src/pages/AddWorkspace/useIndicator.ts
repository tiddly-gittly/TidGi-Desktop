import { useState, useEffect } from 'react';

export function useWikiCreationProgress(
  wikiCreationMessageSetter: (message: string) => void,
  wikiCreationMessage?: string,
  hasError?: boolean,
): [boolean, React.Dispatch<React.SetStateAction<boolean>>, boolean] {
  const [logPanelOpened, logPanelSetter] = useState<boolean>(false);
  const [inProgressOrError, inProgressOrErrorSetter] = useState<boolean>(false);
  useEffect(() => {
    const creationInProgress = wikiCreationMessage !== undefined && wikiCreationMessage.length > 0 && hasError !== true;
    if (creationInProgress) {
      logPanelSetter(true);
      inProgressOrErrorSetter(true);
    }
    if (hasError === true) {
      logPanelSetter(false);
      inProgressOrErrorSetter(false);
    } else if (!creationInProgress) {
      logPanelSetter(false);
      inProgressOrErrorSetter(false);
    }
  }, [wikiCreationMessage, hasError]);
  // register to WikiChannel.createProgress on component mount
  useEffect(() => {
    const unregister = window.log.registerWikiCreationMessage((message: string) => {
      wikiCreationMessageSetter(message);
    });
    return unregister;
  }, [wikiCreationMessageSetter]);
  return [logPanelOpened, logPanelSetter, inProgressOrError];
}
