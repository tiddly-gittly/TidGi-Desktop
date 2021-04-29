import React from 'react';
import { useTranslation } from 'react-i18next';

import { Typography, LinearProgress, Snackbar } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';

import type { IWikiWorkspaceFormProps } from './useForm';
import { useValidateExistedWiki, useExistedWiki } from './useExistedWiki';
import { useWikiCreationProgress } from './useIndicator';
import { WikiLocation, CloseButton } from './FormComponents';

export function ExistedWikiDoneButton({
  form,
  isCreateMainWorkspace,
  isCreateSyncedWorkspace,
}: IWikiWorkspaceFormProps & { isCreateMainWorkspace: boolean; isCreateSyncedWorkspace: boolean }): JSX.Element {
  const { t } = useTranslation();
  const [, hasError, wikiCreationMessage, wikiCreationMessageSetter, hasErrorSetter] = useValidateExistedWiki(
    isCreateMainWorkspace,
    isCreateSyncedWorkspace,
    form,
  );
  const onSubmit = useExistedWiki(isCreateMainWorkspace, form, wikiCreationMessageSetter, hasErrorSetter);
  const [logPanelOpened, logPanelSetter, progressBarOpen] = useWikiCreationProgress(wikiCreationMessage, hasError);
  if (hasError) {
    return (
      <CloseButton variant="contained" disabled>
        {wikiCreationMessage}
      </CloseButton>
    );
  }
  return (
    <>
      {progressBarOpen && <LinearProgress color="secondary" />}
      <Snackbar open={logPanelOpened} autoHideDuration={5000} onClose={() => logPanelSetter(false)}>
        <Alert severity="info">{wikiCreationMessage}</Alert>
      </Snackbar>

      {isCreateMainWorkspace ? (
        <CloseButton variant="contained" color="secondary" onClick={onSubmit}>
          <Typography variant="body1" display="inline">
            {t('AddWorkspace.ImportWiki')}
          </Typography>
          <WikiLocation>{form.existedWikiFolderPath}</WikiLocation>
        </CloseButton>
      ) : (
        <CloseButton variant="contained" color="secondary" onClick={onSubmit}>
          <Typography variant="body1" display="inline">
            {t('AddWorkspace.ImportWiki')}
          </Typography>
          <WikiLocation>{form.existedWikiFolderPath}</WikiLocation>
          <Typography variant="body1" display="inline">
            {t('AddWorkspace.AndLinkToMainWorkspace')}
          </Typography>
        </CloseButton>
      )}
    </>
  );
}
