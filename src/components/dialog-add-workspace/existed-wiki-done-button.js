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
import { basename, dirname } from 'path';

import * as actions from '../../state/dialog-add-workspace/actions';

import type { IUserInfo } from './user-info';
import { requestCreateSubWiki, getIconPath, ensureWikiExist } from '../../senders';
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
  existedFolderLocation: string,
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

function DoneButton({
  isCreateMainWorkspace,
  wikiPort,
  mainWikiToLink,
  githubWikiUrl,
  existedFolderLocation,
  updateForm,
  setWikiCreationMessage,
  wikiCreationMessage,
  tagName,
  save,
  userInfo,
}: Props) {
  const port = isCreateMainWorkspace ? wikiPort : mainWikiToLink.port;
  const workspaceFormData = {
    name: existedFolderLocation,
    isSubWiki: !isCreateMainWorkspace,
    mainWikiToLink: mainWikiToLink.name,
    port,
    homeUrl: `http://localhost:${port}/`,
    gitUrl: githubWikiUrl, // don't need .git suffix
    picturePath: getIconPath(),
    userInfo,
    tagName: isCreateMainWorkspace ? undefined : tagName,
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
          disabled={!existedFolderLocation || !githubWikiUrl || progressBarOpen || !userInfo}
          onClick={async () => {
            updateForm(workspaceFormData);
            const creationError = await ensureWikiExist(existedFolderLocation, true);
            if (creationError) {
              setWikiCreationMessage(creationError);
            } else {
              save();
            }
          }}
        >
          <Trans t={t} i18nKey="AddWorkspace.NewWikiDoneButton" wikiFolderLocation={existedFolderLocation}>
            {existedFolderLocation && (
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
                  {{ wikiFolderLocation: existedFolderLocation }}
                </Typography>
              </>
            )}
            <Typography variant="body1" display="inline">
              as Wiki folder
            </Typography>
          </Trans>
        </CloseButton>
      ) : (
        <CloseButton
          variant="contained"
          color="secondary"
          disabled={!existedFolderLocation || !mainWikiToLink.name || !githubWikiUrl || progressBarOpen || !userInfo}
          onClick={async () => {
            if (!userInfo) return;
            const wikiFolderName = basename(existedFolderLocation);
            const parentFolderLocation = dirname(existedFolderLocation);
            updateForm(workspaceFormData);
            let creationError = await ensureWikiExist(existedFolderLocation, false);
            if (!creationError) {
              creationError = await requestCreateSubWiki(
                parentFolderLocation,
                wikiFolderName,
                mainWikiToLink.name,
                githubWikiUrl,
                true,
              );
            }
            if (creationError) {
              setWikiCreationMessage(creationError);
            } else {
              save();
            }
          }}
        >
          <Trans t={t} i18nKey="AddWorkspace.NewSubWikiDoneButton" wikiFolderLocation={existedFolderLocation}>
            {existedFolderLocation && (
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
                  {{ wikiFolderLocation: existedFolderLocation }}
                </Typography>
              </>
            )}
            <Typography variant="body1" display="inline">
              as Wiki folder
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
  DoneButton,
);
