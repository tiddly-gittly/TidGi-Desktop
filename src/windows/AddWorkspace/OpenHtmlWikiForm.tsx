import FolderIcon from '@mui/icons-material/Folder';
import { Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useValidateOpenHtmlWiki } from './useOpenHtmlWiki';

import { CreateContainer, LocationPickerButton, LocationPickerContainer, LocationPickerInput } from './FormComponents';

import type { IWikiWorkspaceFormProps } from './useForm';

export function OpenHtmlWikiForm({
  form,
  errorInWhichComponent,
  errorInWhichComponentSetter,
}: IWikiWorkspaceFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const { wikiHtmlPathSetter, wikiHtmlPath, wikiFolderNameSetter } = form;

  useValidateOpenHtmlWiki(form, errorInWhichComponentSetter);

  return (
    <CreateContainer elevation={2} square>
      <Typography variant='body2' sx={{ mb: 2 }}>
        {t('AddWorkspace.OpenHtmlWikiFileDescription')}
      </Typography>
      <LocationPickerContainer>
        <LocationPickerInput
          error={errorInWhichComponent.wikiHtmlPath}
          onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            wikiHtmlPathSetter(event.target.value);
          }}
          label={t('AddWorkspace.LocalWikiHtml')}
          value={wikiHtmlPath}
        />
        <LocationPickerButton
          onClick={async () => {
            wikiHtmlPathSetter('');
            const filePaths = await window.service.native.pickFile([{ name: 'html', extensions: ['html', 'htm', 'hta'] }]);
            if (filePaths.length > 0) {
              wikiHtmlPathSetter(filePaths[0]);
              const fileName = await window.service.native.path('basename', filePaths[0]);
              if (fileName !== undefined) {
                wikiFolderNameSetter(fileName.replace(/\.(html|htm|hta)$/i, ''));
              }
            }
          }}
          endIcon={<FolderIcon />}
        >
          <Typography variant='button' sx={{ display: 'inline' }}>
            {t('AddWorkspace.Choose')}
          </Typography>
        </LocationPickerButton>
      </LocationPickerContainer>
    </CreateContainer>
  );
}
