import { Alert, LinearProgress, Snackbar, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { CloseButton, ReportErrorFabButton } from './FormComponents';
import type { IWikiWorkspaceFormProps } from './useForm';
import { useWikiCreationProgress } from './useIndicator';
import { useOpenHtmlWiki, useValidateOpenHtmlWiki } from './useOpenHtmlWiki';

export function OpenHtmlWikiDoneButton({
  form,
  errorInWhichComponentSetter,
}: IWikiWorkspaceFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [hasError, wikiCreationMessage, wikiCreationMessageSetter, hasErrorSetter] = useValidateOpenHtmlWiki(form, errorInWhichComponentSetter);
  const onSubmit = useOpenHtmlWiki(form, wikiCreationMessageSetter, hasErrorSetter, errorInWhichComponentSetter);
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
      <CloseButton variant='contained' color='secondary' disabled={inProgressOrError} onClick={onSubmit} data-testid='open-html-wiki-done-button'>
        <Typography variant='body1' sx={{ display: 'inline' }}>
          {t('AddWorkspace.OpenHtmlWikiFile')}
        </Typography>
      </CloseButton>
    </>
  );
}
