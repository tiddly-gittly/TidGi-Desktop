// @flow
import type { ComponentType } from 'react';
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { useTranslation } from 'react-i18next';

import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import InputLabel from '@material-ui/core/InputLabel';
import FormHelperText from '@material-ui/core/FormHelperText';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import FolderIcon from '@material-ui/icons/Folder';

import * as actions from '../../state/dialog-add-workspace/actions';

import { getWorkspaces } from '../../senders';

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

type OwnProps = {|
  wikiCreationMessage?: string,
  existedFolderLocationSetter: string => void,
  wikiFolderName: string,
  wikiFolderNameSetter: string => void,
  tagName: string,
  tagNameSetter: string => void,
  mainWikiToLink: Object,
  mainWikiToLinkSetter: Object => void,
  existedFolderLocation: string,
  wikiPort: number,
  wikiPortSetter: number => void,
  isCreateMainWorkspace: boolean,
|};
type DispatchProps = {|
  setWikiCreationMessage: string => void,
|};
type StateProps = {|
  wikiCreationMessage: string,
|};

type Props = {
  ...OwnProps,
  ...DispatchProps,
  ...StateProps,
};

function WikiPathForm({
  setWikiCreationMessage,
  wikiCreationMessage = '',
  existedFolderLocation,
  existedFolderLocationSetter,
  tagName,
  tagNameSetter,
  wikiFolderName,
  wikiFolderNameSetter,
  mainWikiToLink,
  mainWikiToLinkSetter,
  wikiPort,
  wikiPortSetter,
  isCreateMainWorkspace,
}: Props) {
  const [workspaces, workspacesSetter] = useState({});
  useEffect(() => {
    workspacesSetter(getWorkspaces());
  }, []);

  const hasError = wikiCreationMessage.startsWith('Error');
  const { t } = useTranslation();
  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput
          error={hasError}
          helperText={hasError ? wikiCreationMessage : ''}
          fullWidth
          onChange={event => {
            existedFolderLocationSetter(event.target.value);
            setWikiCreationMessage('');
          }}
          label={t('AddWorkspace.WorkspaceFolder')}
          value={existedFolderLocation}
        />
        <LocationPickerButton
          onClick={() => {
            const { dialog } = window.remote;
            // eslint-disable-next-line promise/catch-or-return
            dialog
              .showOpenDialog({
                properties: ['openDirectory'],
              })
              .then(({ canceled, filePaths }) => {
                // eslint-disable-next-line promise/always-return
                if (!canceled && filePaths.length > 0) {
                  existedFolderLocationSetter(filePaths[0]);
                }
              });
          }}
          variant="outlined"
          color={existedFolderLocation ? 'default' : 'primary'}
          disableElevation
          endIcon={<FolderIcon />}
        >
          <Typography variant="button" display="inline">
            {t('AddWorkspace.Choose')}
          </Typography>
        </LocationPickerButton>
      </LocationPickerContainer>
      {isCreateMainWorkspace && (
        <LocationPickerInput
          fullWidth
          onChange={event => {
            wikiPortSetter(event.target.value);
          }}
          label={t('AddWorkspace.WikiServerPort')}
          value={wikiPort}
        />
      )}
      {!isCreateMainWorkspace && (
        <>
          <TextField
            fullWidth
            onChange={event => tagNameSetter(event.target.value)}
            label={t('AddWorkspace.TagName')}
            helperText={t('AddWorkspace.TagNameHelp')}
            value={tagName}
          />
          <SoftLinkToMainWikiSelectInputLabel id="main-wiki-select-label">
            {t('AddWorkspace.MainWorkspaceLocation')}
          </SoftLinkToMainWikiSelectInputLabel>
          <SoftLinkToMainWikiSelect
            labelId="main-wiki-select-label"
            id="main-wiki-select"
            value={mainWikiToLink}
            onChange={event => mainWikiToLinkSetter(event.target.value)}
          >
            {Object.keys(workspaces).map(workspaceID => (
              <MenuItem key={workspaceID} value={workspaces[workspaceID]}>
                {workspaces[workspaceID].name}
              </MenuItem>
            ))}
          </SoftLinkToMainWikiSelect>
          {mainWikiToLink.name && (
            <FormHelperText>
              <Typography variant="body1" display="inline" component="span">
                {t('AddWorkspace.SubWorkspaceWillLinkTo')}
              </Typography>
              <Typography
                variant="body2"
                component="span"
                noWrap
                display="inline"
                align="center"
                style={{ direction: 'rtl', textTransform: 'none' }}
              >
                {mainWikiToLink.name}/tiddlers/{wikiFolderName}
              </Typography>
            </FormHelperText>
          )}
        </>
      )}
    </CreateContainer>
  );
}

const mapStateToProps = state => ({
  wikiCreationMessage: state.dialogAddWorkspace.wikiCreationMessage,
});

export default connect<Props, OwnProps, _, _, _, _>(mapStateToProps, dispatch => bindActionCreators(actions, dispatch))(
  WikiPathForm,
);
