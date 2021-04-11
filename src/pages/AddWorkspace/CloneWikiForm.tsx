/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React from 'react';
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
import { useValidateCloneWiki } from './useCloneWiki';

export function CloneWikiForm({ form, isCreateMainWorkspace }: IWikiWorkspaceFormProps & { isCreateMainWorkspace: boolean }): JSX.Element {
  const { t } = useTranslation();
  const [errorInWhichComponent] = useValidateCloneWiki(isCreateMainWorkspace, form);
  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput
          error={errorInWhichComponent.parentFolderLocation}
          onChange={(event) => form.parentFolderLocationSetter(event.target.value)}
          label={t('AddWorkspace.WorkspaceFolder')}
          value={form.parentFolderLocation}
        />
        <LocationPickerButton
          onClick={async () => {
            const filePaths = await window.service.native.pickDirectory();
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
          label={t('AddWorkspace.WorkspaceFolderNameToCreate')}
          helperText={`${t('AddWorkspace.CloneWiki')}${form.wikiFolderLocation}`}
          value={form.wikiFolderName}
        />
      </LocationPickerContainer>
      {isCreateMainWorkspace && (
        <LocationPickerContainer>
          <LocationPickerInput
            error={errorInWhichComponent.wikiPort}
            onChange={(event) => {
              form.wikiPortSetter(Number(event.target.value));
            }}
            label={t('AddWorkspace.WikiServerPort')}
            value={form.wikiPort}
          />
        </LocationPickerContainer>
      )}
      {!isCreateMainWorkspace && (
        <>
          <SoftLinkToMainWikiSelect
            error={errorInWhichComponent.mainWikiToLink}
            label={t('AddWorkspace.MainWorkspaceLocation')}
            helperText={
              form.mainWikiToLink.name &&
              `${t('AddWorkspace.SubWorkspaceWillLinkTo')}
                    ${form.mainWikiToLink.name}/tiddlers/${form.wikiFolderName}`
            }
            value={form.mainWikiToLinkIndex}
            onChange={(event) => {
              const index = (event.target.value as unknown) as number;
              form.mainWikiToLinkSetter(form.mainWorkspaceList[index]);
            }}>
            {form.mainWorkspaceList.map((workspace, index) => (
              <MenuItem key={index} value={index}>
                {workspace.name}
              </MenuItem>
            ))}
          </SoftLinkToMainWikiSelect>
          <SubWikiTagAutoComplete
            options={form.fileSystemPaths.map((fileSystemPath) => fileSystemPath.tagName)}
            value={form.tagName}
            onInputChange={(_, value) => form.tagNameSetter(value)}
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
