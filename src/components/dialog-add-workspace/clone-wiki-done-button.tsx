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

import type { IUserInfo } from '@services/types';
import { getIconPath } from '../../senders';

import useWikiCreationMessage from './use-wiki-creation-message';

const CloseButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;

interface OwnProps {
  isCreateMainWorkspace: boolean;
  wikiPort: number;
  mainWikiToLink: { name: string; port: number };
  githubWikiUrl: string;
  wikiFolderName: string;
  parentFolderLocation: string;
  tagName: string;
  userInfo: IUserInfo;
}
interface DispatchProps {
  // @ts-expect-error ts-migrate(7051) FIXME: Parameter has a name but no type. Did you mean 'ar... Remove this comment to see the full error message
  updateForm: (Object) => void;
  // @ts-expect-error ts-migrate(7051) FIXME: Parameter has a name but no type. Did you mean 'ar... Remove this comment to see the full error message
  setWikiCreationMessage: (string) => void;
  save: () => void;
}
interface StateProps {
  wikiCreationMessage: string;
}

type Props = OwnProps & DispatchProps & StateProps;

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
    tagName: isCreateMainWorkspace ? undefined : tagName,
  };

  const [snackBarOpen, progressBarOpen, snackBarOpenSetter] = useWikiCreationMessage(wikiCreationMessage);
  const { t } = useTranslation();
  return (
    <>
      {progressBarOpen && <LinearProgress color="secondary" />}
      {/* @ts-expect-error ts-migrate(2322) FIXME: Type 'boolean | Dispatch<SetStateAction<boolean>>'... Remove this comment to see the full error message */}
      <Snackbar open={snackBarOpen} autoHideDuration={5000} onClose={() => snackBarOpenSetter(false)}>
        <Alert severity="info">{wikiCreationMessage}</Alert>
      </Snackbar>

      {isCreateMainWorkspace ? (
        <CloseButton
          variant="contained"
          color="secondary"
          // @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call.
          disabled={!parentFolderLocation || !githubWikiUrl || progressBarOpen || !userInfo}
          onClick={async () => {
            if (!userInfo) {
              setWikiCreationMessage(t('AddWorkspace.NotLoggedIn'));
              return;
            }
            updateForm(workspaceFormData);
            let cloneError: string | undefined;
            try {
              await window.service.wiki.cloneWiki(parentFolderLocation, wikiFolderName, githubWikiUrl, userInfo);
            } catch (error) {
              cloneError = String(error);
            }
            if (cloneError !== undefined) {
              setWikiCreationMessage(cloneError);
            } else {
              save();
            }
          }}>
          {/* @ts-expect-error ts-migrate(2322) FIXME: Type '{ children: ("" | Element)[]; t: TFunction<s... Remove this comment to see the full error message */}
          <Trans t={t} i18nKey="AddWorkspace.CloneWikiDoneButton" wikiFolderLocation={wikiFolderLocation}>
            {parentFolderLocation && (
              <>
                <Typography variant="body1" display="inline">
                  Use
                </Typography>
                <Typography variant="body2" noWrap display="inline" align="center" style={{ direction: 'rtl', textTransform: 'none' }}>
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
          // @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call.
          disabled={!parentFolderLocation || !mainWikiToLink.name || !githubWikiUrl || progressBarOpen || !userInfo}
          onClick={async () => {
            if (!userInfo) {
              setWikiCreationMessage(t('AddWorkspace.NotLoggedIn'));
              return;
            }
            updateForm(workspaceFormData);
            let creationError: string | undefined;
            try {
              await window.service.wiki.cloneSubWiki(parentFolderLocation, wikiFolderName, mainWikiToLink.name, githubWikiUrl, userInfo, tagName);
            } catch (error) {
              creationError = String(error);
            }
            if (creationError !== undefined) {
              setWikiCreationMessage(creationError);
            } else {
              save();
            }
          }}>
          {/* @ts-expect-error ts-migrate(2322) FIXME: Type '{ children: ("" | Element)[]; t: TFunction<s... Remove this comment to see the full error message */}
          <Trans t={t} i18nKey="AddWorkspace.CloneSubWikiDoneButton" wikiFolderLocation={wikiFolderLocation}>
            {parentFolderLocation && (
              <>
                <Typography variant="body1" display="inline">
                  Use
                </Typography>
                <Typography variant="body2" noWrap display="inline" align="center" style={{ direction: 'rtl', textTransform: 'none' }}>
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

const mapStateToProps = (state: any) => ({
  wikiCreationMessage: state.dialogAddWorkspace.wikiCreationMessage,
});

// @ts-expect-error ts-migrate(2558) FIXME: Expected 5 type arguments, but got 6.
export default connect<Props, OwnProps, _, _, _, _>(mapStateToProps, (dispatch) => bindActionCreators(actions, dispatch))(CloneWikiDoneButton);
