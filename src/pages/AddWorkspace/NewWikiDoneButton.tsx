/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { useTranslation } from 'react-i18next';

import { LinearProgress, Snackbar, Typography } from '@mui/material';
import Alert from '@mui/lab/Alert';

import { CloseButton, ReportErrorFabButton, WikiLocation } from './FormComponents';
import type { IWikiWorkspaceFormProps } from './useForm';
import { useWikiCreationProgress } from './useIndicator';
import { useNewWiki, useValidateNewWiki } from './useNewWiki';

export function NewWikiDoneButton({
  form,
  isCreateMainWorkspace,
  isCreateSyncedWorkspace,
  errorInWhichComponentSetter,
}: IWikiWorkspaceFormProps & { isCreateMainWorkspace: boolean; isCreateSyncedWorkspace: boolean }): JSX.Element {
  const { t } = useTranslation();
  const [hasError, wikiCreationMessage, wikiCreationMessageSetter, hasErrorSetter] = useValidateNewWiki(
    isCreateMainWorkspace,
    isCreateSyncedWorkspace,
    form,
    errorInWhichComponentSetter,
  );
  const onSubmit = useNewWiki(isCreateMainWorkspace, isCreateSyncedWorkspace, form, wikiCreationMessageSetter, hasErrorSetter, errorInWhichComponentSetter);
  const [logPanelOpened, logPanelSetter, inProgressOrError] = useWikiCreationProgress(wikiCreationMessageSetter, wikiCreationMessage, hasError);
  if (hasError) {
    return (
      <>
        <CloseButton variant='contained' disabled={true}>
          {wikiCreationMessage}
        </CloseButton>
        {wikiCreationMessage !== undefined && <ReportErrorFabButton message={wikiCreationMessage} />}
      </>
    );
  }
  return (
    <>
      {inProgressOrError && <LinearProgress color='secondary' />}
      <Snackbar
        open={logPanelOpened}
        autoHideDuration={5000}
        onClose={() => {
          logPanelSetter(false);
        }}
      >
        <Alert severity='info'>{wikiCreationMessage}</Alert>
      </Snackbar>

      {isCreateMainWorkspace
        ? (
          <CloseButton variant='contained' color='secondary' disabled={inProgressOrError} onClick={onSubmit}>
            <Typography variant='body1' display='inline'>
              {t('AddWorkspace.CreateWiki')}
            </Typography>
            <WikiLocation>{form.wikiFolderLocation}</WikiLocation>
          </CloseButton>
        )
        : (
          <CloseButton variant='contained' color='secondary' disabled={inProgressOrError} onClick={onSubmit}>
            <Typography variant='body1' display='inline'>
              {t('AddWorkspace.CreateWiki')}
            </Typography>
            <WikiLocation>{form.wikiFolderLocation}</WikiLocation>
            <Typography variant='body1' display='inline'>
              {t('AddWorkspace.AndLinkToMainWorkspace')}
            </Typography>
          </CloseButton>
        )}
    </>
  );
}
