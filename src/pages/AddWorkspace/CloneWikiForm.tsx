/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { Folder as FolderIcon } from '@mui/icons-material';
import { AutocompleteRenderInputParams, MenuItem, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { CreateContainer, LocationPickerButton, LocationPickerContainer, LocationPickerInput, SoftLinkToMainWikiSelect, SubWikiTagAutoComplete } from './FormComponents';

import { useValidateCloneWiki } from './useCloneWiki';
import type { IWikiWorkspaceFormProps } from './useForm';

export function CloneWikiForm({ form, isCreateMainWorkspace, errorInWhichComponent, errorInWhichComponentSetter }: IWikiWorkspaceFormProps): JSX.Element {
  const { t } = useTranslation();
  useValidateCloneWiki(isCreateMainWorkspace, form, errorInWhichComponentSetter);
  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput
          error={errorInWhichComponent.parentFolderLocation}
          onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            form.parentFolderLocationSetter(event.target.value);
          }}
          label={t('AddWorkspace.WorkspaceParentFolder')}
          value={form.parentFolderLocation}
        />
        <LocationPickerButton
          onClick={async () => {
            // first clear the text, so button will refresh
            form.parentFolderLocationSetter('');
            const filePaths = await window.service.native.pickDirectory(form.parentFolderLocation);
            if (filePaths?.length > 0) {
              form.parentFolderLocationSetter(filePaths[0]);
            }
          }}
          endIcon={<FolderIcon />}
        >
          <Typography variant='button' display='inline'>
            {t('AddWorkspace.Choose')}
          </Typography>
        </LocationPickerButton>
      </LocationPickerContainer>
      <LocationPickerContainer>
        <LocationPickerInput
          error={errorInWhichComponent.wikiFolderName}
          onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            form.wikiFolderNameSetter(event.target.value);
          }}
          label={t('AddWorkspace.WorkspaceFolderNameToCreate')}
          helperText={`${t('AddWorkspace.CloneWiki')}${form.wikiFolderLocation ?? ''}`}
          value={form.wikiFolderName}
        />
      </LocationPickerContainer>
      {!isCreateMainWorkspace && (
        <>
          <SoftLinkToMainWikiSelect
            error={errorInWhichComponent.mainWikiToLink}
            label={t('AddWorkspace.MainWorkspaceLocation')}
            helperText={form.mainWikiToLink.wikiFolderLocation &&
              `${t('AddWorkspace.SubWorkspaceWillLinkTo')}
                    ${form.mainWikiToLink.wikiFolderLocation}/tiddlers/${form.wikiFolderName}`}
            value={form.mainWikiToLinkIndex}
            onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              const index = event.target.value as unknown as number;
              form.mainWikiToLinkSetter(form.mainWorkspaceList[index]);
            }}
          >
            {form.mainWorkspaceList.map((workspace, index) => (
              <MenuItem key={index} value={index}>
                {workspace.name}
              </MenuItem>
            ))}
          </SoftLinkToMainWikiSelect>
          <SubWikiTagAutoComplete
            options={form.fileSystemPaths.map((fileSystemPath) => fileSystemPath.tagName)}
            value={form.tagName}
            onInputChange={(event: React.SyntheticEvent, value: string) => {
              form.tagNameSetter(value);
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
