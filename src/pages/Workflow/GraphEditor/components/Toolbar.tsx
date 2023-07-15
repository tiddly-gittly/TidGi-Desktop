import { sidebarWidth } from '@/constants/style';
import EditIcon from '@mui/icons-material/Edit';
import HomeIcon from '@mui/icons-material/Home';
import InfoIcon from '@mui/icons-material/Info';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import VisibilityOnIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import { IconButton, Toolbar, Tooltip } from '@mui/material';
import { PageType } from '@services/pages/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import React, { Dispatch, MutableRefObject, SetStateAction, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { ITheGraphEditor } from 'the-graph';
import { useLocation } from 'wouter';
import { IWorkflowContext } from '../../useContext';
import { AddItemDialog } from '../../WorkflowManage/AddItemDialog';
import { addWorkflowToWiki, useAvailableFilterTags } from '../../WorkflowManage/useWorkflowDataSource';
import { IWorkflowListItem } from '../../WorkflowManage/WorkflowList';
import { searchBarWidth } from './styleConstant';

const ToolbarContainer = styled(Toolbar)`
  position: absolute;
  top: 1em;
  left: ${sidebarWidth + searchBarWidth}px;
  min-height: unset;
  /** same as the search bar */
  height: 56px;
`;

interface IGraphTopToolbarProps {
  editorReference: MutableRefObject<ITheGraphEditor | undefined>;
  readonly: boolean;
  setReadonly: Dispatch<SetStateAction<boolean>>;
  workflowContext: IWorkflowContext;
}
export const GraphTopToolbar = (props: IGraphTopToolbarProps) => {
  const { editorReference, readonly, setReadonly, workflowContext } = props;
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const runWorkflow = useCallback(() => {
    console.log('Running workflow...');
  }, []);

  const backToHome = useCallback(() => {
    // don't need to save here, because we already debouncedSave after all operations
    setLocation(`/${WindowNames.main}/${PageType.workflow}/`);
  }, [setLocation]);

  const toggleReadonly = useCallback(() => {
    setReadonly((readonly: boolean) => !readonly);
  }, [setReadonly]);

  const zoomToFit = useCallback(() => {
    editorReference?.current?.triggerFit();
  }, [editorReference]);

  const [changeGraphInfoDialogOpen, setChangeGraphInfoDialogOpen] = useState(false);
  const workspacesList = useWorkspacesListObservable();
  const [availableFilterTags] = useAvailableFilterTags(workspacesList);
  const changeGraphInfo = useCallback(() => {
    setChangeGraphInfoDialogOpen(true);
  }, []);
  const closeChangeGraphInfoDialog = useCallback(() => {
    setChangeGraphInfoDialogOpen(false);
  }, []);
  const handleDialogAddWorkflow = useCallback(async (newItem: IWorkflowListItem, oldItem?: IWorkflowListItem) => {
    await addWorkflowToWiki(newItem, oldItem);
    workflowContext.setOpenedWorkflowItem(newItem);
    closeChangeGraphInfoDialog();
  }, [closeChangeGraphInfoDialog, workflowContext]);

  const changeSelectedItemInfo = useCallback(() => {
    console.log('Changing selected item info...');
  }, []);

  return (
    <>
      <ToolbarContainer>
        <Tooltip title={t('Workflow.RunWorkflow')}>
          <IconButton onClick={runWorkflow}>
            <PlayArrowIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('Workflow.BackToHome')}>
          <IconButton onClick={backToHome}>
            <HomeIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={readonly ? t('Workflow.ToggleOnReadonly') : t('Workflow.ToggleOffReadonly')}>
          <IconButton onClick={toggleReadonly}>
            {readonly ? <VisibilityOnIcon /> : <VisibilityOffIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title={t('Workflow.ZoomToFit')}>
          <IconButton onClick={zoomToFit}>
            <ZoomOutMapIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('Workflow.ChangeWorkflowMetadata')}>
          <IconButton onClick={changeGraphInfo}>
            <InfoIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('Workflow.ChangeSelectedItemInfo')}>
          <IconButton onClick={changeSelectedItemInfo}>
            <EditIcon />
          </IconButton>
        </Tooltip>
      </ToolbarContainer>
      <AddItemDialog
        open={changeGraphInfoDialogOpen}
        onClose={closeChangeGraphInfoDialog}
        onAdd={handleDialogAddWorkflow}
        availableFilterTags={availableFilterTags}
        workspacesList={workspacesList}
        item={workflowContext.openedWorkflowItem}
      />
    </>
  );
};
