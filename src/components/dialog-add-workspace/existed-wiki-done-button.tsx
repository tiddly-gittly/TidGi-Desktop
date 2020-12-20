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

import type { IUserInfo } from '../../helpers/user-info';
import { requestCreateSubWiki, getIconPath, ensureWikiExist, getBaseName, getDirectoryName } from '../../senders';
// @ts-expect-error ts-migrate(6142) FIXME: Module './use-wiki-creation-message' was resolved ... Remove this comment to see the full error message
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
  existedFolderLocation: string;
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
    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      {progressBarOpen && <LinearProgress color="secondary" />}
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Snackbar open={snackBarOpen} autoHideDuration={5000} onClose={() => snackBarOpenSetter(false)}>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Alert severity="info">{wikiCreationMessage}</Alert>
      </Snackbar>

      {isCreateMainWorkspace ? (
        // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
          }}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Trans t={t} i18nKey="AddWorkspace.NewWikiDoneButton" wikiFolderLocation={existedFolderLocation}>
            {existedFolderLocation && (
              // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Typography variant="body1" display="inline">
                  Use
                </Typography>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Typography variant="body2" noWrap display="inline" align="center" style={{ direction: 'rtl', textTransform: 'none' }}>
                  {{ wikiFolderLocation: existedFolderLocation }}
                </Typography>
              </>
            )}
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Typography variant="body1" display="inline">
              as Wiki folder
            </Typography>
          </Trans>
        </CloseButton>
      ) : (
        // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <CloseButton
          variant="contained"
          color="secondary"
          disabled={!existedFolderLocation || !mainWikiToLink.name || !githubWikiUrl || progressBarOpen || !userInfo}
          onClick={async () => {
            if (!userInfo) return;
            const wikiFolderName = getBaseName(existedFolderLocation);
            const parentFolderLocation = getDirectoryName(existedFolderLocation);
            updateForm(workspaceFormData);
            let creationError = await ensureWikiExist(existedFolderLocation, false);
            if (!creationError) {
              creationError = await requestCreateSubWiki(parentFolderLocation, wikiFolderName, mainWikiToLink.name, tagName, true);
            }
            if (creationError) {
              setWikiCreationMessage(creationError);
            } else {
              save();
            }
          }}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Trans t={t} i18nKey="AddWorkspace.NewSubWikiDoneButton" wikiFolderLocation={existedFolderLocation}>
            {existedFolderLocation && (
              // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Typography variant="body1" display="inline">
                  Use
                </Typography>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Typography variant="body2" noWrap display="inline" align="center" style={{ direction: 'rtl', textTransform: 'none' }}>
                  {{ wikiFolderLocation: existedFolderLocation }}
                </Typography>
              </>
            )}
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Typography variant="body1" display="inline">
              as Wiki folder
            </Typography>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
export default connect<Props, OwnProps, _, _, _, _>(mapStateToProps, (dispatch) => bindActionCreators(actions, dispatch))(DoneButton);
