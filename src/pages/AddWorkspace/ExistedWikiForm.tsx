/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { Folder as FolderIcon } from '@mui/icons-material';
import { AutocompleteRenderInputParams, MenuItem, Typography } from '@mui/material';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { CreateContainer, LocationPickerButton, LocationPickerContainer, LocationPickerInput, SoftLinkToMainWikiSelect, SubWikiTagAutoComplete } from './FormComponents';

import { useValidateExistedWiki } from './useExistedWiki';
import type { IWikiWorkspaceFormProps } from './useForm';

export function ExistedWikiForm({
  form,
  isCreateMainWorkspace,
  isCreateSyncedWorkspace,
  errorInWhichComponent,
  errorInWhichComponentSetter,
}: IWikiWorkspaceFormProps & { isCreateSyncedWorkspace: boolean }): JSX.Element {
  const { t } = useTranslation();
  const {
    wikiFolderLocation,
    wikiFolderNameSetter,
    parentFolderLocation,
    parentFolderLocationSetter,
    wikiPortSetter,
    wikiPort,
    mainWikiToLink,
    wikiFolderName,
    mainWikiToLinkIndex,
    mainWikiToLinkSetter,
    mainWorkspaceList,
    fileSystemPaths,
    tagName,
    tagNameSetter,
  } = form;
  useValidateExistedWiki(isCreateMainWorkspace, isCreateSyncedWorkspace, form, errorInWhichComponentSetter);
  const onLocationChange = useCallback(
    async (newLocation: string) => {
      const folderName = await window.service.native.path('basename', newLocation);
      const directoryName = await window.service.native.path('dirname', newLocation);
      if (folderName !== undefined && directoryName !== undefined) {
        wikiFolderNameSetter(folderName);
        parentFolderLocationSetter(directoryName);
      }
    },
    [wikiFolderNameSetter, parentFolderLocationSetter],
  );
  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput
          error={errorInWhichComponent.wikiFolderLocation}
          onChange={async (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            await onLocationChange(event.target.value);
          }}
          label={t('AddWorkspace.WorkspaceFolder')}
          helperText={`${t('AddWorkspace.ImportWiki')}${wikiFolderLocation ?? ''}`}
          value={wikiFolderLocation}
        />
        <LocationPickerButton
          onClick={async () => {
            // first clear the text, so button will refresh
            await onLocationChange('');
            const filePaths = await window.service.native.pickDirectory(parentFolderLocation);
            if (filePaths?.length > 0) {
              await onLocationChange(filePaths[0]);
            }
          }}
          endIcon={<FolderIcon />}
        >
          <Typography variant='button' display='inline'>
            {t('AddWorkspace.Choose')}
          </Typography>
        </LocationPickerButton>
      </LocationPickerContainer>
      {!isCreateMainWorkspace && (
        <>
          <SoftLinkToMainWikiSelect
            error={errorInWhichComponent.mainWikiToLink}
            label={t('AddWorkspace.MainWorkspaceLocation')}
            helperText={mainWikiToLink.wikiFolderLocation &&
              `${t('AddWorkspace.SubWorkspaceWillLinkTo')}
                    ${mainWikiToLink.wikiFolderLocation}/tiddlers/${wikiFolderName}`}
            value={mainWikiToLinkIndex}
            onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              const index = event.target.value as unknown as number;
              mainWikiToLinkSetter(mainWorkspaceList[index]);
            }}
          >
            {mainWorkspaceList.map((workspace, index) => (
              <MenuItem key={index} value={index}>
                {workspace.name}
              </MenuItem>
            ))}
          </SoftLinkToMainWikiSelect>
          <SubWikiTagAutoComplete
            options={fileSystemPaths.map((fileSystemPath) => fileSystemPath.tagName)}
            value={tagName}
            onInputChange={(event: React.SyntheticEvent, value: string) => {
              tagNameSetter(value);
            }}
            renderInput={(parameters: AutocompleteRenderInputParams) => (
              <LocationPickerInput
                {...parameters}
                error={errorInWhichComponent.tagName}
                label={t('AddWorkspace.TagName')}
                helperText={t('AddWorkspace.TagNameHelp')}
              />
            )}
          />
        </>
      )}
    </CreateContainer>
  );
}
