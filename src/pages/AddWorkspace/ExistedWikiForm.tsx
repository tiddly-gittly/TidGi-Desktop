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
import { useValidateExistedWiki } from './useExistedWiki';

export function ExistedWikiForm({
  form,
  isCreateMainWorkspace,
  isCreateSyncedWorkspace,
}: IWikiWorkspaceFormProps & { isCreateMainWorkspace: boolean; isCreateSyncedWorkspace: boolean }): JSX.Element {
  const { t } = useTranslation();
  const [errorInWhichComponent] = useValidateExistedWiki(isCreateMainWorkspace, isCreateSyncedWorkspace, form);
  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput
          error={errorInWhichComponent.existedWikiFolderPath}
          onChange={(event) => {
            form.existedWikiFolderPathSetter(event.target.value);
          }}
          label={t('AddWorkspace.WorkspaceFolder')}
          helperText={`${t('AddWorkspace.ImportWiki')}${form.existedWikiFolderPath}`}
          value={form.existedWikiFolderPath}
        />
        <LocationPickerButton
          onClick={async () => {
            const filePaths = await window.service.native.pickDirectory();
            if (filePaths?.length > 0) {
              form.existedWikiFolderPathSetter(filePaths[0]);
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
