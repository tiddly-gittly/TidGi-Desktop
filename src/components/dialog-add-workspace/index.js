import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';

import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import TextField from '@material-ui/core/TextField';
import Button from '@material-ui/core/Button';
import FolderIcon from '@material-ui/icons/Folder';
import GithubIcon from '@material-ui/icons/GitHub';

import connectComponent from '../../helpers/connect-component';

import { getHits, updateMode, updateScrollOffset } from '../../state/dialog-add-workspace/actions';

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

const AddWorkspace = () => {
  return (
    <Container>
      <Description elevation={0} square>
        主知识库包含了TiddlyWiki的配置文件，以及发布为博客时的公开内容。
      </Description>

      <CreateContainer elevation={2} square>
        <Typography variant="subtitle1" align="center">
          创建主知识库
        </Typography>
        <LocationPickerButton variant="contained" color="primary" disableElevation endIcon={<FolderIcon />}>
          <Typography variant="button" display="inline">
            选择位置
          </Typography>
        </LocationPickerButton>
        <LocationPickerInput fullWidth id="standard-basic" label="知识库位置" />
      </CreateContainer>
      <SyncContainer elevation={2} square>
        <Typography variant="subtitle1" align="center">
          同步到云端
        </Typography>
        <SyncToGithubButton color="secondary" endIcon={<GithubIcon />}>登录Github账号</SyncToGithubButton>
      </SyncContainer>
    </Container>
  );
};

AddWorkspace.defaultProps = {
  currentQuery: '',
};

AddWorkspace.propTypes = {
  classes: PropTypes.object.isRequired,
  currentQuery: PropTypes.string,
  hasFailed: PropTypes.bool.isRequired,
  hits: PropTypes.arrayOf(PropTypes.object).isRequired,
  isGetting: PropTypes.bool.isRequired,
  mode: PropTypes.string.isRequired,
  onGetHits: PropTypes.func.isRequired,
  onUpdateMode: PropTypes.func.isRequired,
  onUpdateScrollOffset: PropTypes.func.isRequired,
  page: PropTypes.number.isRequired,
  scrollOffset: PropTypes.number.isRequired,
  shouldUseDarkColors: PropTypes.bool.isRequired,
  totalPage: PropTypes.number.isRequired,
};

const mapStateToProps = (state) => ({
  currentQuery: state.dialogAddWorkspace.currentQuery,
  hasFailed: state.dialogAddWorkspace.hasFailed,
  hits: state.dialogAddWorkspace.hits,
  isGetting: state.dialogAddWorkspace.isGetting,
  mode: state.dialogAddWorkspace.mode,
  page: state.dialogAddWorkspace.page,
  scrollOffset: state.dialogAddWorkspace.scrollOffset,
  shouldUseDarkColors: state.general.shouldUseDarkColors,
  totalPage: state.dialogAddWorkspace.totalPage,
});

const actionCreators = {
  getHits,
  updateMode,
  updateScrollOffset,
};

export default connectComponent(AddWorkspace, mapStateToProps, actionCreators);
