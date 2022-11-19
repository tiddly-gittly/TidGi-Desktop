import { useTranslation } from 'react-i18next';
import { Typography } from '@material-ui/core';
import { Folder as FolderIcon } from '@material-ui/icons';
import { useValidateHtmlWiki } from './useImportHtmlWiki';

import { CreateContainer, LocationPickerContainer, LocationPickerInput, LocationPickerButton } from './FormComponents';

import type { IWikiWorkspaceFormProps } from './useForm';

export function ImportHtmlWikiForm({
  form,
  isCreateMainWorkspace,
  isCreateSyncedWorkspace,
  errorInWhichComponent,
  errorInWhichComponentSetter,
}: IWikiWorkspaceFormProps & { isCreateSyncedWorkspace: boolean }): JSX.Element {
  const { t } = useTranslation();
  const { wikiHtmlPathSetter, wikiFolderLocation, wikiFolderName, wikiHtmlPath, parentFolderLocation, wikiFolderNameSetter } = form;

  useValidateHtmlWiki(isCreateMainWorkspace, isCreateSyncedWorkspace, form, errorInWhichComponentSetter);
  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput
          error={errorInWhichComponent.wikiHtmlPath}
          onChange={(event) => {
            // https://zh-hans.reactjs.org/docs/events.html#clipboard-events
            wikiHtmlPathSetter(event.target.value);
          }}
          label={t('AddWorkspace.LocalWikiHtml')}
          value={wikiHtmlPath}
        />
        <LocationPickerButton
          // 第一个输入框的选择文件夹按钮。
          onClick={async () => {
            // first clear the text, so button will refresh
            wikiHtmlPathSetter('');
            const filePaths = await window.service.native.pickFile([{ name: 'html文件', extensions: ['html', 'htm'] }]);
            if (filePaths?.length > 0) {
              wikiHtmlPathSetter(filePaths[0]);
              const fileName = await window.service.native.path('basename', filePaths[0]);
              if (fileName !== undefined) {
                // use html file name as default wiki name
                wikiFolderNameSetter(fileName.split('.')[0]);
              }
            }
          }}
          endIcon={<FolderIcon />}>
          <Typography variant="button" display="inline">
            {t('AddWorkspace.Choose')}
          </Typography>
        </LocationPickerButton>
      </LocationPickerContainer>
      <LocationPickerContainer>
        <LocationPickerInput
          error={errorInWhichComponent.parentFolderLocation}
          onChange={(event) => form.parentFolderLocationSetter(event.target.value)}
          label={t('AddWorkspace.WorkspaceParentFolder')}
          value={parentFolderLocation}
        />
        <LocationPickerButton
          onClick={async () => {
            // first clear the text, so button will refresh
            form.parentFolderLocationSetter('');
            const filePaths = await window.service.native.pickDirectory(parentFolderLocation);
            if (filePaths?.length > 0) {
              form.parentFolderLocationSetter(filePaths[0]);
            }
          }}
          endIcon={<FolderIcon />}>
          <Typography variant="button" display="inline">
            {t('AddWorkspace.Choose')}
          </Typography>
        </LocationPickerButton>
      </LocationPickerContainer>
      <LocationPickerContainer>
        <LocationPickerInput
          error={errorInWhichComponent.wikiFolderName}
          onChange={(event) => wikiFolderNameSetter(event.target.value)}
          label={t('AddWorkspace.ExtractedWikiFolderName')}
          helperText={`${t('AddWorkspace.CreateWiki')}${wikiFolderLocation ?? ''}`}
          value={wikiFolderName}
        />
      </LocationPickerContainer>
    </CreateContainer>
  );
}
