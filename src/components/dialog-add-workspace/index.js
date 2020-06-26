// @flow
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import is from 'styled-is';

import Paper from '@material-ui/core/Paper';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';
import TextField from '@material-ui/core/TextField';
import Button from '@material-ui/core/Button';
import FolderIcon from '@material-ui/icons/Folder';
import GithubIcon from '@material-ui/icons/GitHub';

import connectComponent from '../../helpers/connect-component';
import { updateForm, save } from '../../state/dialog-add-workspace/actions';

import { requestCopyWikiTemplate, getIconPath } from '../../senders';

const Container = styled.main`
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;
const Description = styled(Paper)`
  padding: 10px;
`;
const CreateContainer = styled(Paper)`
  margin-top: 5px;
`;
const LocationPickerInput = styled(TextField)``;
const LocationPickerButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;
const CreatorButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
  ${is('disabled')`
    display: none;
  `}
  border-radius: 0;
`;
const SyncToGithubButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;
const SyncContainer = styled(Paper)`
  margin-top: 5px;
`;
const CloseButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
  position: absolute;
  bottom: 0;
`;

function AddWorkspace({ wikiCreationMessage, onUpdateForm, onSave }) {
  const [isCreateMainWorkspace, isCreateMainWorkspaceSetter] = useState(true);
  const [parentFolderLocation, parentFolderLocationSetter] = useState('');
  const [wikiFolderLocation, wikiFolderLocationSetter] = useState('');
  const [wikiFolderName, wikiFolderNameSetter] = useState('tiddlywiki');
  useEffect(() => {
    wikiFolderLocationSetter(`${parentFolderLocation}/${wikiFolderName}`);
  }, [parentFolderLocation, wikiFolderName]);
  const messageHasError = wikiCreationMessage.startsWith('Error: ');
  const message = wikiCreationMessage.replace('Error: ', '');
  const succeed = !messageHasError && wikiCreationMessage.length > 0;
  const workspaceFormData = { name: wikiFolderLocation, homeUrl: 'http://localhost:5112/', picturePath: getIconPath() };
  return (
    <Container>
      <Description elevation={0} square>
        <FormControlLabel
          control={
            <Switch
              checked={isCreateMainWorkspace}
              onChange={event => isCreateMainWorkspaceSetter(event.target.checked)}
            />
          }
          label={`创建${isCreateMainWorkspace ? '主' : '子'}知识库`}
        />
        {isCreateMainWorkspace
          ? '主知识库包含了TiddlyWiki的配置文件，以及发布为博客时的公开内容。'
          : '子知识库必须依附于一个主知识库，可用于存放私有内容，同步到一个私有的Github仓库内，仅本人可读写。'}
      </Description>

      <CreateContainer elevation={2} square>
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
          variant="contained"
          color={parentFolderLocation ? 'default' : 'primary'}
          disableElevation
          endIcon={<FolderIcon />}
        >
          <Typography variant="button" display="inline">
            选择放置WIKI的父文件夹
          </Typography>
        </LocationPickerButton>
        <LocationPickerInput
          error={messageHasError}
          helperText={message}
          fullWidth
          onChange={event => parentFolderLocationSetter(event.target.value)}
          label="知识库的父文件夹"
          value={parentFolderLocation}
          disabled={succeed}
        />
        <LocationPickerInput
          fullWidth
          onChange={event => wikiFolderNameSetter(event.target.value)}
          label="知识库文件夹名"
          value={wikiFolderName}
          disabled={succeed}
        />
        <CreatorButton
          variant="contained"
          color="primary"
          disabled={parentFolderLocation.length === 0 || succeed}
          onClick={() => {
            if (isCreateMainWorkspace) {
              requestCopyWikiTemplate(parentFolderLocation, wikiFolderName);
            } else {
            }
            onUpdateForm(workspaceFormData);
          }}
        >
          <Typography variant="body1" display="inline">
            在
          </Typography>
          <Typography
            variant="body2"
            noWrap
            display="inline-block"
            align="center"
            style={{ direction: 'rtl', textTransform: 'none' }}
          >
            {wikiFolderLocation}
          </Typography>
          <Typography variant="body1" display="inline">
            创建WIKI
          </Typography>
        </CreatorButton>
      </CreateContainer>

      <SyncContainer elevation={2} square>
        <Typography variant="subtitle1" align="center">
          同步到云端
        </Typography>
        <SyncToGithubButton color="secondary" endIcon={<GithubIcon />}>
          登录Github账号
        </SyncToGithubButton>
      </SyncContainer>

      <CloseButton
        variant="contained"
        color="secondary"
        disabled={!succeed}
        onClick={() => {
          onUpdateForm(workspaceFormData);
          onSave();
        }}
      >
        启动WIKI
      </CloseButton>
    </Container>
  );
}

AddWorkspace.defaultProps = {
  wikiCreationMessage: '',
};

AddWorkspace.propTypes = {
  wikiCreationMessage: PropTypes.string,
  onUpdateForm: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

const mapStateToProps = state => ({
  wikiCreationMessage: state.dialogAddWorkspace.wikiCreationMessage,
});

const actionCreators = {
  updateForm,
  save,
};

export default connectComponent(AddWorkspace, mapStateToProps, actionCreators);
