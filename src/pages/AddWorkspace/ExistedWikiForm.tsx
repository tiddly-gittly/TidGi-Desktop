/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, MenuItem } from '@material-ui/core';
import { Folder as FolderIcon } from '@material-ui/icons';

import {
  CreateContainer,
  LocationPickerContainer,
  LocationPickerInput,
  LocationPickerButton,
  SoftLinkToMainWikiSelect,
  SubWikiTagAutoComplete,
} from './FormComponents';

import type { IWikiWorkspaceFormProps } from './useForm';
import { useValidateExistedWiki } from './useExistedWiki';

export function ExistedWikiForm({
  form,
  isCreateMainWorkspace,
  isCreateSyncedWorkspace,
  errorInWhichComponent,
  errorInWhichComponentSetter,
}: IWikiWorkspaceFormProps & { isCreateSyncedWorkspace: boolean }): JSX.Element {
  const { t } = useTranslation();
  const {
    existedWikiFolderPathSetter,
    wikiFolderNameSetter,
    existedWikiFolderPath,
    parentFolderLocation,
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
    (newLocation: string) => {
      const folderName = window.remote.getBaseName(newLocation);
      if (folderName !== undefined) {
        existedWikiFolderPathSetter(newLocation);
        wikiFolderNameSetter(folderName);
      }
    },
    [existedWikiFolderPathSetter, wikiFolderNameSetter],
  );
  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput
          error={errorInWhichComponent.existedWikiFolderPath}
          onChange={(event) => {
            onLocationChange(event.target.value);
          }}
          label={t('AddWorkspace.WorkspaceFolder')}
          helperText={`${t('AddWorkspace.ImportWiki')}${existedWikiFolderPath}`}
          value={existedWikiFolderPath}
        />
        <LocationPickerButton
          onClick={async () => {
            // first clear the text, so button will refresh
            onLocationChange('');
            const filePaths = await window.service.native.pickDirectory(parentFolderLocation);
            if (filePaths?.length > 0) {
              onLocationChange(filePaths[0]);
            }
          }}
          endIcon={<FolderIcon />}>
          <Typography variant="button" display="inline">
            {t('AddWorkspace.Choose')}
          </Typography>
        </LocationPickerButton>
      </LocationPickerContainer>
      {isCreateMainWorkspace && (
        <LocationPickerContainer>
          <LocationPickerInput
            error={errorInWhichComponent.wikiPort}
            onChange={(event) => {
              wikiPortSetter(Number(event.target.value));
            }}
            label={t('AddWorkspace.WikiServerPort')}
            value={wikiPort}
          />
        </LocationPickerContainer>
      )}
      {!isCreateMainWorkspace && (
        <>
          <SoftLinkToMainWikiSelect
            error={errorInWhichComponent.mainWikiToLink}
            label={t('AddWorkspace.MainWorkspaceLocation')}
            helperText={
              mainWikiToLink.wikiFolderLocation &&
              `${t('AddWorkspace.SubWorkspaceWillLinkTo')}
                    ${mainWikiToLink.wikiFolderLocation}/tiddlers/${wikiFolderName}`
            }
            value={mainWikiToLinkIndex}
            onChange={(event) => {
              const index = event.target.value as unknown as number;
              mainWikiToLinkSetter(mainWorkspaceList[index]);
            }}>
            {mainWorkspaceList.map((workspace, index) => (
              <MenuItem key={index} value={index}>
                {workspace.name}
              </MenuItem>
            ))}
          </SoftLinkToMainWikiSelect>
          <SubWikiTagAutoComplete
            options={fileSystemPaths.map((fileSystemPath) => fileSystemPath.tagName)}
            value={tagName}
            onInputChange={(_, value) => tagNameSetter(value)}
            renderInput={(parameters) => (
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
