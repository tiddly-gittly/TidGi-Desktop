import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';
import { Graph } from 'fbp-graph';
import { loadJSON } from 'fbp-graph/lib/Graph';
import { useContext, useEffect, useState } from 'react';
import { IWorkflowContext, WorkflowContext } from '../useContext';
import { addWorkflowToWiki } from '../WorkflowManage/useWorkflowDataSource';

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
  useEffect(() => {
    // save on graph changed
    if (graph !== undefined) {
      void debouncedOnSave(graph, workflowContext);
    }
  }, [debouncedOnSave, graph, workflowContext]);

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
