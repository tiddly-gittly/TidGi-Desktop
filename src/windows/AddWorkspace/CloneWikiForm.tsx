import FolderIcon from '@mui/icons-material/Folder';
import { Autocomplete, AutocompleteRenderInputParams, MenuItem, Typography } from '@mui/material';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isWikiWorkspace } from '@services/workspaces/interface';
import { CreateContainer, LocationPickerButton, LocationPickerContainer, LocationPickerInput, SoftLinkToMainWikiSelect } from './FormComponents';

import { useAvailableTags } from './useAvailableTags';
import { useValidateCloneWiki } from './useCloneWiki';
import type { IWikiWorkspaceFormProps } from './useForm';

export function CloneWikiForm({ form, isCreateMainWorkspace, errorInWhichComponent, errorInWhichComponentSetter }: IWikiWorkspaceFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [tagInputValue, setTagInputValue] = useState<string>('');
  useValidateCloneWiki(isCreateMainWorkspace, form, errorInWhichComponentSetter);

  // Fetch all tags from main wiki for autocomplete suggestions
  const availableTags = useAvailableTags(form.mainWikiToLink.id, !isCreateMainWorkspace);

  const tagHelperText = tagInputValue.trim().length > 0
    ? t('AddWorkspace.TagNameInputWarning')
    : (isCreateMainWorkspace
      ? t('AddWorkspace.TagNameHelpForMain')
      : t('AddWorkspace.TagNameHelp'));

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
            if (filePaths.length > 0) {
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
            select
            error={errorInWhichComponent.mainWikiToLink}
            label={t('AddWorkspace.MainWorkspaceLocation')}
            helperText={form.mainWikiToLink.wikiFolderLocation &&
              `${t('AddWorkspace.SubWorkspaceWillLinkTo')}
                    ${form.mainWikiToLink.wikiFolderLocation}`}
            value={form.mainWikiToLinkIndex}
            onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              const index = Number(event.target.value);
              const selectedWorkspace = form.mainWorkspaceList[index];
              if (selectedWorkspace && isWikiWorkspace(selectedWorkspace)) {
                form.mainWikiToLinkSetter({
                  wikiFolderLocation: selectedWorkspace.wikiFolderLocation,
                  port: selectedWorkspace.port,
                  id: selectedWorkspace.id,
                });
              }
            }}
          >
            {form.mainWorkspaceList.map((workspace, index) => (
              <MenuItem key={index} value={index}>
                {workspace.name}
              </MenuItem>
            ))}
          </SoftLinkToMainWikiSelect>
          <Autocomplete<string, true, false, true>
            multiple
            freeSolo
            options={availableTags}
            value={form.tagNames}
            onInputChange={(_event, newInputValue) => {
              setTagInputValue(newInputValue);
            }}
            onChange={(_event, newValue) => {
              form.tagNamesSetter(newValue);
              setTagInputValue('');
            }}
            slotProps={{
              chip: {
                variant: 'outlined',
              },
            }}
            renderInput={(parameters: AutocompleteRenderInputParams) => (
              <LocationPickerInput
                error={errorInWhichComponent.tagNames}
                {...parameters}
                label={t('AddWorkspace.TagName')}
                helperText={tagHelperText}
              />
            )}
          />
        </>
      )}
    </CreateContainer>
  );
}
