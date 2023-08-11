import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';
import { Graph } from 'fbp-graph';
import { loadJSON } from 'fbp-graph/lib/Graph';
import { useContext, useEffect, useRef, useState } from 'react';
import { IWorkflowContext, WorkflowContext } from '../useContext';
import { addWorkflowToWiki } from '../WorkflowManage/useWorkflowDataSource';

/**
 * From `graphEvents` of elements/the-graph.js
 */
const changeEvents = [
  'changeProperties',
  'addNode',
  'changeNode',
  'removeNode',
  'addEdge',
  'changeEdge',
  'removeEdge',
  'addInitial',
  'removeInitial',
  'addGroup',
  'removeGroup',
  'changeGroup',
  // graphRenameEvents
  'renameInport',
  'renameOutport',
  'renameGroup',
  'renameNode',
  // graphPortEvents: [
  'addInport',
  'removeInport',
  'addOutport',
  'removeOutport',
];
export function useSaveLoadGraph() {
  const workflowContext = useContext(WorkflowContext);

  const [graph, setGraph] = useState<Graph | undefined>();
  useEffect(() => {
    // this hook is only for initial load
    if (graph !== undefined) return;
    // this is set when when click open on src/pages/Workflow/WorkflowManage/WorkflowList.tsx , so it usually won't be undefined.
    const graphJSON = workflowContext.openedWorkflowItem?.graphJSONString;
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (graphJSON) {
      void loadJSON(graphJSON).then(graph => {
        setGraph(graph);
      });
    }
  }, [graph, workflowContext.openedWorkflowItem]);
  const debouncedOnSave = useDebouncedCallback(onSave, [], 1000);
  const onSaveListenerRegistered = useRef(false);
  /**
   * use reference to prevent workflowContext's change trigger `graph.removeListener` below
   */
  const workflowContextReference = useRef(workflowContext);
  useEffect(() => {
    workflowContextReference.current = workflowContext;
  }, [workflowContext]);
  useEffect(() => {
    const onChangeCallback = async () => {
      if (graph === undefined) return;
      await debouncedOnSave(graph, workflowContextReference.current);
    };
    // save on graph changed
    if (graph !== undefined && !onSaveListenerRegistered.current) {
      onSaveListenerRegistered.current = true;
      changeEvents.forEach(eventName => {
        graph.on(eventName, onChangeCallback);
      });
      return () => {
        changeEvents.forEach(eventName => {
          graph.removeListener(eventName, onChangeCallback);
        });
      };
    }
  }, [debouncedOnSave, graph, onSaveListenerRegistered, workflowContextReference]);

  return [graph, setGraph] as const;
}

async function onSave(graph: Graph, workflowContext: IWorkflowContext) {
  if (workflowContext.openedWorkflowItem === undefined) return;
  const graphJSON = graph.toJSON();
  const graphJSONString = JSON.stringify(graphJSON);
  if (graphJSONString === workflowContext.openedWorkflowItem.graphJSONString) return;
  const newItem = { ...workflowContext.openedWorkflowItem, graphJSONString };
  workflowContext.setOpenedWorkflowItem(newItem);
  await addWorkflowToWiki(newItem);
}
