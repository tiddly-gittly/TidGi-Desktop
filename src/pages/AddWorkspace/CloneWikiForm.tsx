/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Paper, Typography, Button, TextField, InputLabel, FormHelperText, Select, MenuItem, Autocomplete } from '@material-ui/core';
import { Folder as FolderIcon } from '@material-ui/icons';
import { usePromiseValue } from '@/helpers/useServiceValue';
import type { IWikiWorkspaceFormProps } from './useForm';
import { useValidateNewWiki } from './useNewWiki';

const CreateContainer = styled(Paper)`
  margin-top: 5px;
`;
const LocationPickerContainer = styled.div`
  display: flex;
  flex-direction: row;
`;
const LocationPickerInput = styled(TextField)``;
const LocationPickerButton = styled(Button)`
  white-space: nowrap;
  width: fit-content;
`;
const SoftLinkToMainWikiSelect = styled(Select)`
  width: 100%;
`;
const SoftLinkToMainWikiSelectInputLabel = styled(InputLabel)`
  margin-top: 5px;
`;

export function CloneWikiForm({ form, isCreateMainWorkspace }: IWikiWorkspaceFormProps & { isCreateMainWorkspace: boolean }): JSX.Element {
  const { t } = useTranslation();
  const [wikiCreationMessage, hasError] = useValidateNewWiki(isCreateMainWorkspace, form);
  const workspaceList = usePromiseValue(async () => await window.service.workspace.getWorkspacesAsList()) ?? [];
  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput
          error={hasError}
          helperText={hasError ? wikiCreationMessage : ''}
          fullWidth
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
          variant="outlined"
          color={typeof form.parentFolderLocation === 'string' && form.parentFolderLocation?.length > 0 ? 'inherit' : 'primary'}
          disableElevation
          endIcon={<FolderIcon />}>
          <Typography variant="button" display="inline">
            {t('AddWorkspace.Choose')}
          </Typography>
        </LocationPickerButton>
      </LocationPickerContainer>
      <LocationPickerInput
        error={hasError}
        fullWidth
        onChange={(event) => form.wikiFolderNameSetter(event.target.value)}
        label={t('AddWorkspace.WorkspaceFolderNameToCreate')}
        value={form.wikiFolderName}
      />
      {isCreateMainWorkspace && (
        <LocationPickerInput
          fullWidth
          onChange={(event) => {
            form.wikiPortSetter(Number(event.target.value));
          }}
          label={t('AddWorkspace.WikiServerPort')}
          value={form.wikiPort}
        />
      )}
      {!isCreateMainWorkspace && (
        <>
          <SoftLinkToMainWikiSelectInputLabel id="main-wiki-select-label">{t('AddWorkspace.MainWorkspaceLocation')}</SoftLinkToMainWikiSelectInputLabel>
          <SoftLinkToMainWikiSelect
            labelId="main-wiki-select-label"
            id="main-wiki-select"
            value={form.mainWikiToLink}
            onChange={(event) => {
              const index = event.target.value as number;
              form.mainWikiToLinkSetter(workspaceList[index]);
            }}>
            {workspaceList.map((workspace, index) => (
              <MenuItem key={index} value={index}>
                {workspace.name}
              </MenuItem>
            ))}
          </SoftLinkToMainWikiSelect>
          {form.mainWikiToLink.name && (
            <FormHelperText>
              <Typography variant="body1" display="inline" component="span">
                {t('AddWorkspace.SubWorkspaceWillLinkTo')}
              </Typography>
              <Typography variant="body2" component="span" noWrap display="inline" align="center" style={{ direction: 'rtl', textTransform: 'none' }}>
                {form.mainWikiToLink.name}/tiddlers/{form.wikiFolderName}
              </Typography>
            </FormHelperText>
          )}
          <Autocomplete
            freeSolo
            options={form.fileSystemPaths.map((fileSystemPath) => fileSystemPath.tagName)}
            value={form.tagName}
            onInputChange={(_, value) => form.tagNameSetter(value)}
            renderInput={(parameters) => <TextField {...parameters} fullWidth label={t('AddWorkspace.TagName')} helperText={t('AddWorkspace.TagNameHelp')} />}
          />
        </>
      )}
    </CreateContainer>
  );
}
