import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { IErrorInWhichComponent } from './useForm';

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

export function updateErrorInWhichComponentSetterByErrorMessage(
  t: TFunction<'translation', undefined>,
  message: string,
  errorInWhichComponentSetter: (errors: IErrorInWhichComponent) => void,
): void {
  if (message.includes(t('AddWorkspace.PathNotExist').replace(/".*"/, ''))) {
    errorInWhichComponentSetter({ parentFolderLocation: true, wikiFolderLocation: true });
  }
  if (message.includes(t('AddWorkspace.CantCreateFolderHere').replace(/".*"/, ''))) {
    errorInWhichComponentSetter({ parentFolderLocation: true });
  }
  if (message.includes(t('AddWorkspace.WikiExisted').replace(/".*"/, ''))) {
    errorInWhichComponentSetter({ wikiFolderName: true });
  }
  if (message.includes(t('AddWorkspace.ThisPathIsNotAWikiFolder').replace(/".*"/, ''))) {
    errorInWhichComponentSetter({ wikiFolderName: true, wikiFolderLocation: true });
  }
  if (message.includes('The unpackwiki command requires that the output wiki folder be empty')) {
    errorInWhichComponentSetter({ wikiFolderName: true, wikiFolderLocation: true });
  }
}
