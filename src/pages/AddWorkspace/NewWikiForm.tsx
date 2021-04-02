import React, { useState, useEffect, ComponentType } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Paper, Typography, Button, TextField, InputLabel, FormHelperText, Select, MenuItem, Autocomplete } from '@material-ui/core';
import { Folder as FolderIcon } from '@material-ui/icons';
import type { IWikiWorkspaceFormProps } from './useForm';

const CreateContainer: ComponentType<{}> = styled(Paper)`
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

export function NewWikiForm({ form }: IWikiWorkspaceFormProps): JSX.Element {
  const { t } = useTranslation();
  const [onSubmit, wikiCreationMessage, hasError] = useCloneWiki(isCreateMainWorkspace, form);

  const { t } = useTranslation();
  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput
          error={hasError}
          helperText={hasError ? wikiCreationMessage : ''}
          fullWidth
          onChange={(event) => {
            parentFolderLocationSetter(event.target.value);
            setWikiCreationMessage('');
          }}
          label={t('AddWorkspace.WorkspaceFolder')}
          value={parentFolderLocation}
        />
        <LocationPickerButton
          onClick={() => {
            const { dialog } = window.remote;
            // eslint-disable-next-line promise/catch-or-return
            dialog
              .showOpenDialog({
                properties: ['openDirectory'],
              })
              .then(({ canceled, filePaths }: any) => {
                // eslint-disable-next-line promise/always-return
                if (!canceled && filePaths.length > 0) {
                  parentFolderLocationSetter(filePaths[0]);
                }
              });
          }}
          variant="outlined"
          color={parentFolderLocation ? 'default' : 'primary'}
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
        onChange={(event) => {
          wikiFolderNameSetter(event.target.value);
          setWikiCreationMessage('');
        }}
        label={t('AddWorkspace.WorkspaceFolderNameToCreate')}
        value={wikiFolderName}
      />
      {isCreateMainWorkspace && (
        <LocationPickerInput
          fullWidth
          onChange={(event) => {
            wikiPortSetter(event.target.value);
          }}
          label={t('AddWorkspace.WikiServerPort')}
          value={wikiPort}
        />
      )}
      {!isCreateMainWorkspace && (
        <>
          <SoftLinkToMainWikiSelectInputLabel id="main-wiki-select-label">{t('AddWorkspace.MainWorkspaceLocation')}</SoftLinkToMainWikiSelectInputLabel>
          <SoftLinkToMainWikiSelect
            labelId="main-wiki-select-label"
            id="main-wiki-select"
            value={mainWikiToLink}
            onChange={(event) => mainWikiToLinkSetter(event.target.value)}>
            {Object.keys(workspaces).map((workspaceID) => (
              <MenuItem key={workspaceID} value={workspaces[workspaceID]}>
                {workspaces[workspaceID].name}
              </MenuItem>
            ))}
          </SoftLinkToMainWikiSelect>
          {(mainWikiToLink as any).name && (
            <FormHelperText>
              <Typography variant="body1" display="inline" component="span">
                {t('AddWorkspace.SubWorkspaceWillLinkTo')}
              </Typography>
              <Typography variant="body2" component="span" noWrap display="inline" align="center" style={{ direction: 'rtl', textTransform: 'none' }}>
                {(mainWikiToLink as any).name}/tiddlers/{wikiFolderName}
              </Typography>
            </FormHelperText>
          )}
          <Autocomplete
            freeSolo
            options={fileSystemPaths.map((fileSystemPath) => fileSystemPath.tagName)}
            value={tagName}
            onInputChange={(_, value) => tagNameSetter(value)}
            renderInput={(parameters) => <TextField {...parameters} fullWidth label={t('AddWorkspace.TagName')} helperText={t('AddWorkspace.TagNameHelp')} />}
          />
        </>
      )}
    </CreateContainer>
  );
}
