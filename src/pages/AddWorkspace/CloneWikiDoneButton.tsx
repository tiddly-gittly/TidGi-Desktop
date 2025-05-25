import { useTranslation } from 'react-i18next';

import { Alert, LinearProgress, Snackbar, Typography } from '@mui/material';
import { CloseButton, ReportErrorFabButton, WikiLocation } from './FormComponents';
import { useCloneWiki, useValidateCloneWiki } from './useCloneWiki';
import type { IWikiWorkspaceFormProps } from './useForm';
import { useWikiCreationProgress } from './useIndicator';

export function CloneWikiDoneButton({ form, isCreateMainWorkspace, errorInWhichComponentSetter }: IWikiWorkspaceFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [hasError, wikiCreationMessage, wikiCreationMessageSetter, hasErrorSetter] = useValidateCloneWiki(
    isCreateMainWorkspace,
    form,
    errorInWhichComponentSetter,
  );
  const onSubmit = useCloneWiki(isCreateMainWorkspace, form, wikiCreationMessageSetter, hasErrorSetter, errorInWhichComponentSetter);
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
              {t('AddWorkspace.CloneWiki')}
            </Typography>
            <WikiLocation>{form.wikiFolderLocation}</WikiLocation>
          </CloseButton>
        )
        : (
          <CloseButton variant='contained' color='secondary' disabled={inProgressOrError} onClick={onSubmit}>
            <Typography variant='body1' display='inline'>
              {t('AddWorkspace.CloneWiki')}
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
