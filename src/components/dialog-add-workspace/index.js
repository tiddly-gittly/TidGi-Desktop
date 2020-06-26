// @flow
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';

import Paper from '@material-ui/core/Paper';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';
import TextField from '@material-ui/core/TextField';
import Button from '@material-ui/core/Button';
import InputLabel from '@material-ui/core/InputLabel';
import FormHelperText from '@material-ui/core/FormHelperText';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import FolderIcon from '@material-ui/icons/Folder';
import GithubIcon from '@material-ui/icons/GitHub';

import connectComponent from '../../helpers/connect-component';
import { updateForm, save, wikiCreationResult } from '../../state/dialog-add-workspace/actions';

import {
  requestCopyWikiTemplate,
  requestCreateSubWiki,
  getIconPath,
  getWorkspaces,
  countWorkspace,
} from '../../senders';

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
const SoftLinkToMainWikiSelect = styled(Select)`
  width: 100%;
`;
const SoftLinkToMainWikiSelectInputLabel = styled(InputLabel)`
  margin-top: 5px;
`;

function AddWorkspace({ wikiCreationMessage, onUpdateForm, onSave, onWikiCreationResult }) {
  const [isCreateMainWorkspace, isCreateMainWorkspaceSetter] = useState(countWorkspace() === 0);
  const [parentFolderLocation, parentFolderLocationSetter] = useState('');
  const [wikiFolderLocation, wikiFolderLocationSetter] = useState('');

  const [workspaces, workspacesSetter] = useState({});
  useEffect(() => {
    workspacesSetter(getWorkspaces());
  }, []);
  const [mainWikiToLink, mainWikiToLinkSetter] = useState('');

  const [wikiFolderName, wikiFolderNameSetter] = useState('tiddlywiki');
  useEffect(() => {
    wikiFolderLocationSetter(`${parentFolderLocation}/${wikiFolderName}`);
  }, [parentFolderLocation, wikiFolderName]);
  const workspaceFormData = {
    name: wikiFolderLocation,
    isSubWiki: !isCreateMainWorkspace,
    port: 5112,
    homeUrl: 'http://localhost:5112/',
    picturePath: getIconPath(),
  };
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
        <Typography variant="body2" display="inline">
          {isCreateMainWorkspace
            ? '主知识库包含了TiddlyWiki的配置文件，以及发布为博客时的公开内容。'
            : '子知识库必须依附于一个主知识库，可用于存放私有内容，同步到一个私有的Github仓库内，仅本人可读写。子知识库通过创建一个到主知识库的软链接（快捷方式）来生效，创建链接后主知识库内便可看到子知识库内的内容了。'}
        </Typography>
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
          error={wikiCreationMessage}
          helperText={wikiCreationMessage}
          fullWidth
          onChange={event => parentFolderLocationSetter(event.target.value)}
          label="知识库的父文件夹"
          value={parentFolderLocation}
        />
        <LocationPickerInput
          fullWidth
          onChange={event => wikiFolderNameSetter(event.target.value)}
          label="知识库文件夹名"
          value={wikiFolderName}
        />
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
                <MenuItem key={workspaceID} value={workspaces[workspaceID].name}>
                  {workspaces[workspaceID].name}
                </MenuItem>
              ))}
            </SoftLinkToMainWikiSelect>
            {mainWikiToLink && (
              <FormHelperText>
                <Typography variant="body1" display="inline">
                  子知识库将链接到
                </Typography>
                <Typography
                  variant="body2"
                  noWrap
                  display="inline"
                  align="center"
                  style={{ direction: 'rtl', textTransform: 'none' }}
                >
                  {mainWikiToLink}/tiddlers/{wikiFolderName}
                </Typography>
              </FormHelperText>
            )}
          </>
        )}
      </CreateContainer>

      <SyncContainer elevation={2} square>
        <Typography variant="subtitle1" align="center">
          同步到云端
        </Typography>
        <SyncToGithubButton color="secondary" endIcon={<GithubIcon />}>
          登录Github账号
        </SyncToGithubButton>
      </SyncContainer>

      {isCreateMainWorkspace ? (
        <CloseButton
          variant="contained"
          color="secondary"
          disabled={!parentFolderLocation}
          onClick={async () => {
            onUpdateForm(workspaceFormData);
            const creationResult = await requestCopyWikiTemplate(parentFolderLocation, wikiFolderName);
            if (creationResult) {
              onSave();
            } else {
              onWikiCreationResult(creationResult);
            }
          }}
        >
          {parentFolderLocation && (
            <>
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
            </>
          )}
          <Typography variant="body1" display="inline">
            创建WIKI
          </Typography>
        </CloseButton>
      ) : (
        <CloseButton
          variant="contained"
          color="secondary"
          disabled={!parentFolderLocation || !mainWikiToLink}
          onClick={async () => {
            onUpdateForm(workspaceFormData);
            const creationResult = await requestCreateSubWiki(parentFolderLocation, wikiFolderName, mainWikiToLink);
            if (creationResult) {
              onSave();
            } else {
              onWikiCreationResult(creationResult);
            }
          }}
        >
          {parentFolderLocation && (
            <>
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
            </>
          )}
          <Typography variant="body1" display="inline">
            创建WIKI
          </Typography>
          <Typography variant="body1" display="inline">
            并链接到主知识库
          </Typography>
        </CloseButton>
      )}
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
  onWikiCreationResult: PropTypes.func.isRequired,
};

const mapStateToProps = state => ({
  wikiCreationMessage: state.dialogAddWorkspace.wikiCreationMessage,
});

const actionCreators = {
  updateForm,
  save,
  wikiCreationResult,
};

export default connectComponent(AddWorkspace, mapStateToProps, actionCreators);
