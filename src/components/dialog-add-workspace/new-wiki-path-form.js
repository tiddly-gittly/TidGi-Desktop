// @flow
import type { ComponentType } from 'react';
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

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
  parentFolderLocationSetter: string => void,
  wikiFolderName: string,
  wikiFolderNameSetter: string => void,
  mainWikiToLink: Object,
  mainWikiToLinkSetter: Object => void,
  parentFolderLocation: string,
  wikiPort: number,
  wikiPortSetter: number => void,
  isCreateMainWorkspace: boolean,
|};
type DispatchProps = {|
  setWikiCreationMessage: string => void,
|};
type StateProps = {|
  wikiCreationMessage?: string,
|};
type Props = { ...OwnProps, ...DispatchProps, ...StateProps };

function NewWikiPathForm({
  setWikiCreationMessage,
  wikiCreationMessage = '',
  parentFolderLocation,
  parentFolderLocationSetter,
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

  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput
          error={hasError}
          helperText={hasError ? wikiCreationMessage : ''}
          fullWidth
          onChange={event => {
            parentFolderLocationSetter(event.target.value);
            setWikiCreationMessage('');
          }}
          label="知识库的父文件夹"
          value={parentFolderLocation}
        />
        <LocationPickerButton
          onClick={() => {
            const { remote } = window.require('electron');
            // eslint-disable-next-line promise/catch-or-return
            remote.dialog
              .showOpenDialog(remote.getCurrentWindow(), {
                properties: ['openDirectory'],
              })
              .then(({ canceled, filePaths }) => {
                // eslint-disable-next-line promise/always-return
                if (!canceled && filePaths.length > 0) {
                  parentFolderLocationSetter(filePaths[0]);
                }
              });
          }}
          variant="outlined"
          color={parentFolderLocation ? 'default' : 'primary'}
          disableElevation
          endIcon={<FolderIcon />}
        >
          <Typography variant="button" display="inline">
            选择
          </Typography>
        </LocationPickerButton>
      </LocationPickerContainer>
      <LocationPickerInput
        error={hasError}
        fullWidth
        onChange={event => {
          wikiFolderNameSetter(event.target.value);
          setWikiCreationMessage('');
        }}
        label="即将新建的知识库文件夹名"
        value={wikiFolderName}
      />
      {isCreateMainWorkspace && (
        <LocationPickerInput
          fullWidth
          onChange={event => {
            wikiPortSetter(event.target.value);
          }}
          label="WIKI服务器端口号（出现冲突再改，一般默认即可）"
          value={wikiPort}
        />
      )}
      {!isCreateMainWorkspace && (
        <>
          <SoftLinkToMainWikiSelectInputLabel id="main-wiki-select-label">
            主知识库位置
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
                子知识库将链接到
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

export default connect<Props, OwnProps, _, _, _, _>(
  (state): { wikiCreationMessage?: string } => ({
    wikiCreationMessage: state.dialogAddWorkspace.wikiCreationMessage,
  }),
  dispatch =>
    bindActionCreators(
      actions,
      dispatch,
    ),
)(NewWikiPathForm);
