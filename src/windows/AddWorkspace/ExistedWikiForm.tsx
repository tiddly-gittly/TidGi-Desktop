import FolderIcon from '@mui/icons-material/Folder';
import { AutocompleteRenderInputParams, MenuItem, Typography } from '@mui/material';
import { useCallback, useState } from 'react';
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

  // Local state for the full path input - like NewWikiForm's direct state binding
  // Initialize from form values
  const [fullPath, setFullPath] = useState(() => {
    if (parentFolderLocation && wikiFolderName) {
      return `${parentFolderLocation}${parentFolderLocation.endsWith('/') || parentFolderLocation.endsWith('\\') ? '' : '/'}${wikiFolderName}`;
    }
    return '';
  });

  useValidateExistedWiki(isCreateMainWorkspace, isCreateSyncedWorkspace, form, errorInWhichComponentSetter);

  const onLocationChange = useCallback(
    async (newLocation: string) => {
      const folderName = await window.service.native.path('basename', newLocation);
      const directoryName = await window.service.native.path('dirname', newLocation);
      if (folderName !== undefined && directoryName !== undefined) {
        wikiFolderNameSetter(folderName);
        parentFolderLocationSetter(directoryName);
        // Update local state
        setFullPath(newLocation);
      }
    },
    [wikiFolderNameSetter, parentFolderLocationSetter],
  );
  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput
          error={errorInWhichComponent.wikiFolderLocation}
          onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            // Update local state immediately for responsive UI
            const newValue = event.target.value;
            setFullPath(newValue);

            // Parse path into parent and folder for validation
            const lastSlashIndex = Math.max(newValue.lastIndexOf('/'), newValue.lastIndexOf('\\'));
            if (lastSlashIndex >= 0) {
              const folder = newValue.slice(lastSlashIndex + 1);
              // Handle root paths: "/" or "C:\"
              const parent = lastSlashIndex === 0 ? '/' : newValue.slice(0, lastSlashIndex);
              wikiFolderNameSetter(folder);
              parentFolderLocationSetter(parent);
            } else {
              // No slash found - treat as relative path or bare folder name
              wikiFolderNameSetter(newValue);
              parentFolderLocationSetter('');
            }
          }}
          label={t('AddWorkspace.WorkspaceFolder')}
          helperText={`${t('AddWorkspace.ImportWiki')}${wikiFolderLocation ?? ''}`}
          value={fullPath}
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
                    ${mainWikiToLink.wikiFolderLocation}`}
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
