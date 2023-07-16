import { sidebarWidth } from '@/constants/style';
import AlignHorizontalLeftIcon from '@mui/icons-material/AlignHorizontalLeft';
import EditOnIcon from '@mui/icons-material/Edit';
import EditLocationAltIcon from '@mui/icons-material/EditLocationAlt';
import EditOffIcon from '@mui/icons-material/EditOff';
import HomeIcon from '@mui/icons-material/Home';
import InfoIcon from '@mui/icons-material/Info';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import { IconButton, Toolbar, Tooltip } from '@mui/material';
import { PageType } from '@services/pages/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import type { Graph } from 'fbp-graph';
import React, { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import type { ITheGraphEditor } from 'the-graph';
import autoLayout from 'the-graph/the-graph/the-graph-autolayout';
import { useLocation } from 'wouter';
import { IWorkflowContext } from '../../useContext';
import { AddItemDialog } from '../../WorkflowManage/AddItemDialog';
import { addWorkflowToWiki, useAvailableFilterTags } from '../../WorkflowManage/useWorkflowDataSource';
import { IWorkflowListItem } from '../../WorkflowManage/WorkflowList';
import { klayNoflo } from 'klayjs-noflo/klay-noflo';
import { searchBarWidth } from './styleConstant';

const ToolbarContainer = styled(Toolbar)`
  position: absolute;
  left: ${sidebarWidth + searchBarWidth}px;
  min-height: unset;
  /** search bar height is 56, button height is 40 */
  height: 40px;
  top: calc(1em + (56px - 40px) / 2);
  background-color: rgba(255,255,255,0.3);
  backdrop-filter: blur(10px);
  border-top-right-radius: 1em;
  border-bottom-right-radius: 1em;
  padding: 0;

  opacity: 0.3;
  &:hover {
    opacity: 1;
  }
  transition: opacity 0.3s ease-in-out;
`;

interface IGraphTopToolbarProps {
  editorReference: MutableRefObject<ITheGraphEditor | undefined>;
  graph: Graph;
  readonly: boolean;
  setReadonly: Dispatch<SetStateAction<boolean>>;
  workflowContext: IWorkflowContext;
}
export const GraphTopToolbar = (props: IGraphTopToolbarProps) => {
  const { editorReference, readonly, setReadonly, workflowContext, graph } = props;
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

  const onAutoLayoutSuccess = useCallback((keilerGraph: unknown) => {
    graph.startTransaction('autolayout');
    autoLayout.applyToGraph(graph, keilerGraph, { snap: 36 });
    graph.endTransaction('autolayout');
    // Fit to window
    zoomToFit();
  }, [graph, zoomToFit]);
  const autoLayouterReference = useRef<typeof klayNoflo | undefined>();
  useEffect(() => {
    const newAutoLayouter = klayNoflo.init({
      onSuccess: onAutoLayoutSuccess,
      workerScript: 'webWorkers/klayjs/klay.js',
    });
    autoLayouterReference.current = newAutoLayouter;
  }, [onAutoLayoutSuccess]);
  const applyAutolayout = useCallback(() => {
    const portInfo = editorReference?.current?.refs?.graph?.portInfo;
    // Calls the autolayouter
    autoLayouterReference.current?.layout({
      graph,
      portInfo,
      direction: 'RIGHT',
      options: {
        intCoordinates: true,
        algorithm: 'de.cau.cs.kieler.klay.layered',
        layoutHierarchy: true,
        spacing: 36,
        borderSpacing: 20,
        edgeSpacingFactor: 0.2,
        inLayerSpacingFactor: 2,
        nodePlace: 'BRANDES_KOEPF',
        nodeLayering: 'NETWORK_SIMPLEX',
        edgeRouting: 'POLYLINE',
        crossMin: 'LAYER_SWEEP',
        direction: 'RIGHT',
      },
    });
  }, [editorReference, graph]);

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
        <Tooltip title={readonly ? t('Workflow.ToggleOffReadonly') : t('Workflow.ToggleOnReadonly')}>
          <IconButton onClick={toggleReadonly}>
            {readonly ? <EditOnIcon /> : <EditOffIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title={t('Workflow.ZoomToFit')}>
          <IconButton onClick={zoomToFit}>
            <ZoomOutMapIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('Workflow.AutoLayout')}>
          <IconButton onClick={applyAutolayout}>
            <AlignHorizontalLeftIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('Workflow.ChangeWorkflowMetadata')}>
          <IconButton onClick={changeGraphInfo}>
            <InfoIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('Workflow.ChangeSelectedItemInfo')}>
          <IconButton onClick={changeSelectedItemInfo}>
            <EditLocationAltIcon />
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
