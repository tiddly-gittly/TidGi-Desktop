import FolderIcon from '@mui/icons-material/Folder';
import { AutocompleteRenderInputParams, MenuItem, Typography } from '@mui/material';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { isWikiWorkspace } from '@services/workspaces/interface';
import { CreateContainer, LocationPickerButton, LocationPickerContainer, LocationPickerInput, SoftLinkToMainWikiSelect, SubWikiTagAutoComplete } from './FormComponents';

import { useAvailableTags } from './useAvailableTags';
import { useValidateExistedWiki } from './useExistedWiki';
import type { IWikiWorkspaceFormProps } from './useForm';

export function ExistedWikiForm({
  form,
  isCreateMainWorkspace,
  isCreateSyncedWorkspace,
  errorInWhichComponent,
  errorInWhichComponentSetter,
}: IWikiWorkspaceFormProps & { isCreateSyncedWorkspace: boolean }): React.JSX.Element {
  const { t } = useTranslation();

  // Fetch all tags from main wiki for autocomplete suggestions
  const availableTags = useAvailableTags(form.mainWikiToLink.id, !isCreateMainWorkspace);

  const {
    wikiFolderLocation,
    wikiFolderNameSetter,
    parentFolderLocation,
    parentFolderLocationSetter,
    mainWikiToLink,
    wikiFolderName,
    mainWikiToLinkIndex,
    mainWikiToLinkSetter,
    mainWorkspaceList,
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
            if (filePaths.length > 0) {
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
            select
            error={errorInWhichComponent.mainWikiToLink}
            label={t('AddWorkspace.MainWorkspaceLocation')}
            helperText={mainWikiToLink.wikiFolderLocation &&
              `${t('AddWorkspace.SubWorkspaceWillLinkTo')}
                    ${mainWikiToLink.wikiFolderLocation}/tiddlers/${wikiFolderName}`}
            value={mainWikiToLinkIndex}
            onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              const index = Number(event.target.value);
              const selectedWorkspace = mainWorkspaceList[index];
              if (selectedWorkspace && isWikiWorkspace(selectedWorkspace)) {
                mainWikiToLinkSetter({
                  wikiFolderLocation: selectedWorkspace.wikiFolderLocation,
                  port: selectedWorkspace.port,
                  id: selectedWorkspace.id,
                });
              }
            }}
          >
            {mainWorkspaceList.map((workspace, index) => (
              <MenuItem key={index} value={index}>
                {workspace.name}
              </MenuItem>
            ))}
          </SoftLinkToMainWikiSelect>
          <SubWikiTagAutoComplete
            freeSolo
            options={availableTags}
            value={tagName}
            onInputChange={(_event: React.SyntheticEvent, value: string) => {
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
