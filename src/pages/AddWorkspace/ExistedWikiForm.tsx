/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, TextField, FormHelperText, MenuItem } from '@material-ui/core';
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

export function ExistedWikiForm({ form, isCreateMainWorkspace }: IWikiWorkspaceFormProps & { isCreateMainWorkspace: boolean }): JSX.Element {
  const { t } = useTranslation();
  const [errorInWhichComponent] = useValidateExistedWiki(isCreateMainWorkspace, form);
  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput
          error={errorInWhichComponent.existedWikiFolderPath}
          onChange={(event) => {
            form.existedWikiFolderPathSetter(event.target.value);
          }}
          label={t('AddWorkspace.WorkspaceFolder')}
          value={form.existedWikiFolderPath}
        />
        <LocationPickerButton
          onClick={async () => {
            const filePaths = await window.service.native.pickDirectory();
            if (filePaths?.length > 0) {
              form.existedWikiFolderPathSetter(filePaths[0]);
            }
          }}
          color={typeof form.existedWikiFolderPath === 'string' && form.existedWikiFolderPath?.length > 0 ? 'inherit' : 'primary'}
          endIcon={<FolderIcon />}>
          <Typography variant="button" display="inline">
            {t('AddWorkspace.Choose')}
          </Typography>
        </LocationPickerButton>
      </LocationPickerContainer>
      {isCreateMainWorkspace && (
        <LocationPickerInput
          error={errorInWhichComponent.wikiPort}
          onChange={(event) => {
            form.wikiPortSetter(Number(event.target.value));
          }}
          label={t('AddWorkspace.WikiServerPort')}
          value={form.wikiPort}
        />
      )}
      {!isCreateMainWorkspace && (
        <>
          <SoftLinkToMainWikiSelect
            error={errorInWhichComponent.mainWikiToLink}
            label={t('AddWorkspace.MainWorkspaceLocation')}
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
