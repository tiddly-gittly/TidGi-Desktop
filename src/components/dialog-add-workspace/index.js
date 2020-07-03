// @flow
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import { GraphQLClient, ClientContext } from 'graphql-hooks';

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

import { GITHUB_GRAPHQL_API } from '../../constants/auth';

import GitHubLogin from './github-login';
import SearchRepo from './search-repo';

import connectComponent from '../../helpers/connect-component';
import { updateForm, save, setWikiCreationMessage } from '../../state/dialog-add-workspace/actions';

import {
  requestCopyWikiTemplate,
  requestCreateSubWiki,
  requestSetPreference,
  getPreference,
  getIconPath,
  getDesktopPath,
  getWorkspaces,
  countWorkspace,
} from '../../senders';

const graphqlClient = new GraphQLClient({
  url: GITHUB_GRAPHQL_API,
});

const Container = styled.main`
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: scroll;
  &::-webkit-scrollbar {
    width: 0;
  }
  padding-bottom: 35px;
`;
const Description = styled(Paper)`
  padding: 10px;
`;
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

const setGithubToken = (token: string) => requestSetPreference('github-token', token);
const getGithubToken = () => getPreference<string | null>('github-token');
const setGithubUsername = (username: string) => requestSetPreference('github-username', username);
const getGithubUsername = () => getPreference<string | null>('github-username');

function AddWorkspace({ wikiCreationMessage, onUpdateForm, onSave, onSetWikiCreationMessage }) {
  const [isCreateMainWorkspace, isCreateMainWorkspaceSetter] = useState(countWorkspace() === 0);
  const [parentFolderLocation, parentFolderLocationSetter] = useState(getDesktopPath());
  const [wikiFolderLocation, wikiFolderLocationSetter] = useState('');
  const [wikiPort, wikiPortSetter] = useState(5212 + countWorkspace());

  // try get token from local storage, and set to state for gql to use
  const setGraphqlClientHeader = useCallback((accessToken: string) => {
    graphqlClient.setHeader('Authorization', `bearer ${accessToken}`);
    setGithubToken(accessToken);
  }, []);
  useEffect(() => {
    const accessToken = getGithubToken();
    if (accessToken) {
      setGraphqlClientHeader(accessToken);
    }
  }, [setGraphqlClientHeader]);

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
    port: wikiPort,
    homeUrl: `http://localhost:${wikiPort}/`,
    picturePath: getIconPath(),
  };
  return (
    <ClientContext.Provider value={graphqlClient}>
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

        <SyncContainer elevation={2} square>
          <Typography variant="subtitle1" align="center">
            同步到云端
          </Typography>
          <GitHubLogin
            clientId="7b6e0fc33f4afd71a4bb"
            clientSecret="6015d1ca4ded86b4778ed39109193ff20c630bdd"
            redirectUri="http://localhost"
            scope="repo"
            onSuccess={response => {
              const accessToken = response?.userInfo?.thirdPartyIdentity?.accessToken;
              if (accessToken) {
                setGraphqlClientHeader(accessToken);
              }
            }}
            onFailure={response => console.log(response)}
          />
          {Object.keys(graphqlClient.headers).length > 0 && <SearchRepo />}
        </SyncContainer>

        <CreateContainer elevation={2} square>
          <LocationPickerContainer>
            <LocationPickerInput
              error={!!wikiCreationMessage}
              helperText={wikiCreationMessage}
              fullWidth
              onChange={event => {
                parentFolderLocationSetter(event.target.value);
                onSetWikiCreationMessage('');
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
            error={!!wikiCreationMessage}
            fullWidth
            onChange={event => {
              wikiFolderNameSetter(event.target.value);
              onSetWikiCreationMessage('');
            }}
            label="知识库文件夹名"
            value={wikiFolderName}
          />
          <LocationPickerInput
            fullWidth
            onChange={event => {
              wikiPortSetter(event.target.value);
            }}
            label="WIKI服务器端口号（出现冲突再改，一般默认即可）"
            value={wikiPort}
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

        {isCreateMainWorkspace ? (
          <CloseButton
            variant="contained"
            color="secondary"
            disabled={!parentFolderLocation}
            onClick={async () => {
              onUpdateForm(workspaceFormData);
              const creationError = await requestCopyWikiTemplate(parentFolderLocation, wikiFolderName);
              if (creationError) {
                onSetWikiCreationMessage(creationError);
              } else {
                onSave();
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
                  display="inline"
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
              const creationError = await requestCreateSubWiki(parentFolderLocation, wikiFolderName, mainWikiToLink);
              if (creationError) {
                onSetWikiCreationMessage(creationError);
              } else {
                onSave();
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
                  display="inline"
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
    </ClientContext.Provider>
  );
}

AddWorkspace.defaultProps = {
  wikiCreationMessage: '',
};

AddWorkspace.propTypes = {
  wikiCreationMessage: PropTypes.string,
  onUpdateForm: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onSetWikiCreationMessage: PropTypes.func.isRequired,
};

const mapStateToProps = state => ({
  wikiCreationMessage: state.dialogAddWorkspace.wikiCreationMessage,
});

const actionCreators = {
  updateForm,
  save,
  setWikiCreationMessage,
};

export default connectComponent(AddWorkspace, mapStateToProps, actionCreators);
