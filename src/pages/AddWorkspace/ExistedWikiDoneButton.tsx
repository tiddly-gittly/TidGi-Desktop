import { useTranslation } from 'react-i18next';

import { LinearProgress, Snackbar, Typography } from '@mui/material';
import Alert from '@mui/lab/Alert';

import { CloseButton, ReportErrorFabButton, WikiLocation } from './FormComponents';
import { useExistedWiki, useValidateExistedWiki } from './useExistedWiki';
import type { IWikiWorkspaceFormProps } from './useForm';
import { useWikiCreationProgress } from './useIndicator';

export function ExistedWikiDoneButton({
  form,
  isCreateMainWorkspace,
  isCreateSyncedWorkspace,
  errorInWhichComponentSetter,
}: IWikiWorkspaceFormProps & { isCreateMainWorkspace: boolean; isCreateSyncedWorkspace: boolean }): JSX.Element {
  const { t } = useTranslation();
  const [hasError, wikiCreationMessage, wikiCreationMessageSetter, hasErrorSetter] = useValidateExistedWiki(
    isCreateMainWorkspace,
    isCreateSyncedWorkspace,
    form,
    errorInWhichComponentSetter,
  );
  const onSubmit = useExistedWiki(isCreateMainWorkspace, isCreateSyncedWorkspace, form, wikiCreationMessageSetter, hasErrorSetter, errorInWhichComponentSetter);
  const [logPanelOpened, logPanelSetter, inProgressOrError] = useWikiCreationProgress(wikiCreationMessageSetter, wikiCreationMessage, hasError);
  if (hasError) {
    return (
      <>
        <CloseButton variant='contained' disabled>
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
              {t('AddWorkspace.ImportWiki')}
            </Typography>
            <WikiLocation>{form.wikiFolderLocation}</WikiLocation>
          </CloseButton>
        )
        : (
          <CloseButton variant='contained' color='secondary' disabled={inProgressOrError} onClick={onSubmit}>
            <Typography variant='body1' display='inline'>
              {t('AddWorkspace.ImportWiki')}
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
