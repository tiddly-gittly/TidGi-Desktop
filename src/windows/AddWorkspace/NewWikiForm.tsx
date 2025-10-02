import FolderIcon from '@mui/icons-material/Folder';
import { AutocompleteRenderInputParams, MenuItem, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { isWikiWorkspace } from '@services/workspaces/interface';
import { CreateContainer, LocationPickerButton, LocationPickerContainer, LocationPickerInput, SoftLinkToMainWikiSelect, SubWikiTagAutoComplete } from './FormComponents';

import type { IWikiWorkspaceFormProps } from './useForm';
import { useValidateNewWiki } from './useNewWiki';

export function NewWikiForm({
  form,
  isCreateMainWorkspace,
  isCreateSyncedWorkspace,
  errorInWhichComponent,
  errorInWhichComponentSetter,
}: IWikiWorkspaceFormProps & { isCreateSyncedWorkspace: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  useValidateNewWiki(isCreateMainWorkspace, isCreateSyncedWorkspace, form, errorInWhichComponentSetter);
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
          helperText={`${t('AddWorkspace.CreateWiki')}${form.wikiFolderLocation ?? ''}`}
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
                    ${form.mainWikiToLink.wikiFolderLocation}/tiddlers/subwiki/${form.wikiFolderName}`}
            value={form.mainWikiToLinkIndex}
            slotProps={{ htmlInput: { 'data-testid': 'main-wiki-select' } }}
            onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              const index = event.target.value as unknown as number;
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
          <SubWikiTagAutoComplete
            freeSolo
            options={form.fileSystemPaths.map((fileSystemPath) => fileSystemPath.tagName)}
            value={form.tagName}
            onInputChange={(_event: React.SyntheticEvent, value: string) => {
              form.tagNameSetter(value);
            }}
            renderInput={(parameters: AutocompleteRenderInputParams) => (
              <LocationPickerInput
                error={errorInWhichComponent.tagName}
                {...parameters}
                label={t('AddWorkspace.TagName')}
                helperText={t('AddWorkspace.TagNameHelp')}
                slotProps={{ htmlInput: { ...parameters.inputProps, 'data-testid': 'tagname-autocomplete-input' } }}
              />
            )}
          />
        </>
      )}
    </CreateContainer>
  );
}
