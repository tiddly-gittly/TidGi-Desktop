/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { useTranslation } from 'react-i18next';
import Alert from '@material-ui/lab/Alert';

import { Typography, LinearProgress, Snackbar } from '@material-ui/core';
import type { IWikiWorkspaceFormProps } from './useForm';
import { useValidateHtmlWiki, useImportHtmlWiki } from './useImportHtmlWiki';
import { useWikiCreationProgress } from './useIndicator';
import { WikiLocation, CloseButton, ReportErrorFabButton } from './FormComponents';

export function ImportHtmlWikiDoneButton({
  form,
  isCreateMainWorkspace,
  isCreateSyncedWorkspace,
  errorInWhichComponentSetter,
}: IWikiWorkspaceFormProps & { isCreateMainWorkspace: boolean; isCreateSyncedWorkspace: boolean }): JSX.Element {
  const { t } = useTranslation();
  const [hasError, wikiCreationMessage, wikiCreationMessageSetter, hasErrorSetter] = useValidateHtmlWiki(
    isCreateMainWorkspace,
    isCreateSyncedWorkspace,
    form,
    errorInWhichComponentSetter,
  );
  const onSubmit = useImportHtmlWiki(
    isCreateMainWorkspace,
    isCreateSyncedWorkspace,
    form,
    wikiCreationMessageSetter,
    hasErrorSetter,
    errorInWhichComponentSetter,
  );
  const [logPanelOpened, logPanelSetter, inProgressOrError] = useWikiCreationProgress(wikiCreationMessageSetter, wikiCreationMessage, hasError);
  if (hasError) {
    return (
      <>
        <CloseButton variant="contained" disabled>
          {wikiCreationMessage}
        </CloseButton>
        {wikiCreationMessage !== undefined && <ReportErrorFabButton message={wikiCreationMessage} />}
      </>
    );
  }
  return (
    <>
      {inProgressOrError && <LinearProgress color="secondary" />}
      {/* 这个好像是log面板 */}
      <Snackbar open={logPanelOpened} autoHideDuration={5000} onClose={() => logPanelSetter(false)}>
        <Alert severity="info">{wikiCreationMessage}</Alert>
      </Snackbar>

      <CloseButton variant="contained" color="secondary" disabled={inProgressOrError} onClick={onSubmit}>
        <Typography variant="body1" display="inline">
          {t('AddWorkspace.ImportWiki')}
        </Typography>
        <WikiLocation>{form.wikiHtmlPath}</WikiLocation>
      </CloseButton>
    </>
  );
}
