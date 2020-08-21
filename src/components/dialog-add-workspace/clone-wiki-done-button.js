// @flow
import React from 'react';
import styled from 'styled-components';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { Trans, useTranslation } from 'react-i18next';

import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import LinearProgress from '@material-ui/core/LinearProgress';
import Snackbar from '@material-ui/core/Snackbar';
import Alert from '@material-ui/lab/Alert';

import * as actions from '../../state/dialog-add-workspace/actions';

import type { IUserInfo } from './user-info';
import { requestCloneWiki, requestCloneSubWiki, getIconPath } from '../../senders';

import useWikiCreationMessage from './use-wiki-creation-message';

const CloseButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;

type OwnProps = {|
  isCreateMainWorkspace: boolean,
  wikiPort: number,
  mainWikiToLink: { name: string, port: number },
  githubWikiUrl: string,
  wikiFolderName: string,
  parentFolderLocation: string,
  tagName?: string,
  userInfo?: IUserInfo,
|};
type DispatchProps = {|
  updateForm: Object => void,
  setWikiCreationMessage: string => void,
  save: () => void,
|};
type StateProps = {|
  wikiCreationMessage: string,
|};

type Props = {
  ...OwnProps,
  ...DispatchProps,
  ...StateProps,
};

function CloneWikiDoneButton({
  isCreateMainWorkspace,
  wikiPort,
  mainWikiToLink,
  githubWikiUrl,
  wikiFolderName,
  parentFolderLocation,
  updateForm,
  setWikiCreationMessage,
  wikiCreationMessage,
  tagName,
  save,
  userInfo,
}: Props) {
  const wikiFolderLocation = `${parentFolderLocation}/${wikiFolderName}`;

  const port = isCreateMainWorkspace ? wikiPort : mainWikiToLink.port;
  const workspaceFormData = {
    name: wikiFolderLocation,
    isSubWiki: !isCreateMainWorkspace,
    mainWikiToLink: mainWikiToLink.name,
    port,
    homeUrl: `http://localhost:${port}/`,
    gitUrl: githubWikiUrl, // don't need .git suffix
    picturePath: getIconPath(),
    userInfo,
  };

  const [snackBarOpen, progressBarOpen, snackBarOpenSetter] = useWikiCreationMessage(wikiCreationMessage);
  const { t } = useTranslation();
  return (
    <>
      {progressBarOpen && <LinearProgress color="secondary" />}
      <Snackbar open={snackBarOpen} autoHideDuration={5000} onClose={() => snackBarOpenSetter(false)}>
        <Alert severity="info">{wikiCreationMessage}</Alert>
      </Snackbar>

      {isCreateMainWorkspace ? (
        <CloseButton
          variant="contained"
          color="secondary"
          disabled={!parentFolderLocation || !githubWikiUrl || progressBarOpen || !userInfo}
          onClick={async () => {
            if (!userInfo) {
              setWikiCreationMessage(t('AddWorkspace.NotLoggedIn'));
              return;
            }
            updateForm(workspaceFormData);
            const cloneError = await requestCloneWiki(parentFolderLocation, wikiFolderName, githubWikiUrl, userInfo);
            if (cloneError) {
              setWikiCreationMessage(cloneError);
            } else {
              save();
            }
          }}
        >
          <Trans t={t} i18nKey="AddWorkspace.CloneWikiDoneButton" wikiFolderLocation={wikiFolderLocation}>
            {parentFolderLocation && (
              <>
                <Typography variant="body1" display="inline">
                  Use
                </Typography>
                <Typography
                  variant="body2"
                  noWrap
                  display="inline"
                  align="center"
                  style={{ direction: 'rtl', textTransform: 'none' }}
                >
                  {{ wikiFolderLocation }}
                </Typography>
              </>
            )}
            <Typography variant="body1" display="inline">
              as cloned Wiki folder
            </Typography>
          </Trans>
        </CloseButton>
      ) : (
        <CloseButton
          variant="contained"
          color="secondary"
          disabled={!parentFolderLocation || !mainWikiToLink.name || !githubWikiUrl || progressBarOpen || !userInfo}
          onClick={async () => {
            if (!userInfo) {
              setWikiCreationMessage(t('AddWorkspace.NotLoggedIn'));
              return;
            }
            updateForm(workspaceFormData);
            const creationError = await requestCloneSubWiki(
              parentFolderLocation,
              wikiFolderName,
              mainWikiToLink.name,
              githubWikiUrl,
              userInfo,
              tagName,
            );
            if (creationError) {
              setWikiCreationMessage(creationError);
            } else {
              save();
            }
          }}
        >
          <Trans t={t} i18nKey="AddWorkspace.CloneSubWikiDoneButton" wikiFolderLocation={wikiFolderLocation}>
            {parentFolderLocation && (
              <>
                <Typography variant="body1" display="inline">
                  Use
                </Typography>
                <Typography
                  variant="body2"
                  noWrap
                  display="inline"
                  align="center"
                  style={{ direction: 'rtl', textTransform: 'none' }}
                >
                  {{ wikiFolderLocation }}
                </Typography>
              </>
            )}
            <Typography variant="body1" display="inline">
              as cloned Wiki folder
            </Typography>
            <Typography variant="body1" display="inline">
              and link to main Workspace
            </Typography>
          </Trans>
        </CloseButton>
      )}
    </>
  );
}

const mapStateToProps = state => ({
  wikiCreationMessage: state.dialogAddWorkspace.wikiCreationMessage,
});

export default connect<Props, OwnProps, _, _, _, _>(mapStateToProps, dispatch => bindActionCreators(actions, dispatch))(
  CloneWikiDoneButton,
);
