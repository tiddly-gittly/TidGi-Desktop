/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React, { useCallback } from 'react';

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
  const { wikiHtmlPathSetter, extractWikiHtmlParentFolderSetter } = form;

  useValidateHtmlWiki(isCreateMainWorkspace, isCreateSyncedWorkspace, form, errorInWhichComponentSetter);

  const onWikiLocationChange = useCallback(
    async (newLocation: string) => {
      if (newLocation !== undefined) {
        wikiHtmlPathSetter(newLocation);
      }
    },
    [wikiHtmlPathSetter],
  );
  const onSaveLocationChange = useCallback(
    async (newLocation: string) => {
      if (newLocation !== undefined) {
        extractWikiHtmlParentFolderSetter(newLocation);
      }
    },
    [extractWikiHtmlParentFolderSetter],
  );
  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput
          error={errorInWhichComponent.extractWikiHtmlParentFolder}
          onChange={(event) => {
            // https://zh-hans.reactjs.org/docs/events.html#clipboard-events
            onWikiLocationChange(event.target.value);
          }}
          label={t('AddWorkspace.LocalWikiHtml')}
          value={form.wikiHtmlPath}
        />
        <LocationPickerButton
          // 第一个输入框的选择文件夹按钮。
          onClick={async () => {
            // first clear the text, so button will refresh
            wikiHtmlPathSetter('');
            const filePaths = await window.service.native.pickFile([{ name: 'html文件', extensions: ['html', 'htm'] }]);
            if (filePaths?.length > 0) {
              wikiHtmlPathSetter(filePaths[0]);
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
          error={errorInWhichComponent.extractWikiHtmlParentFolder}
          onChange={(event) => {
            onSaveLocationChange(event.target.value);
          }}
          label={t('AddWorkspace.StoreWikiFolderLocation')}
          value={form.extractWikiHtmlParentFolder}
        />
        <LocationPickerButton
          // 第二个输入框的选择文件夹按钮。
          onClick={async () => {
            // first clear the text, so button will refresh
            extractWikiHtmlParentFolderSetter('');
            const filePaths = await window.service.native.pickDirectory(form.wikiFolderLocation);
            if (filePaths?.length > 0) {
              extractWikiHtmlParentFolderSetter(filePaths[0]);
            }
          }}
          endIcon={<FolderIcon />}>
          <Typography variant="button" display="inline">
            {t('AddWorkspace.Choose')}
          </Typography>
        </LocationPickerButton>
      </LocationPickerContainer>
    </CreateContainer>
  );
}
