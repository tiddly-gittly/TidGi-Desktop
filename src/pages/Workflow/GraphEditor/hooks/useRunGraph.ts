import { useCallback, useContext, useEffect, useState } from 'react';
import { WorkflowContext } from './useContext';

export function useRunGraph() {
  const [currentNetworkID, setCurrentNetworkID] = useState<string | undefined>();
  const [graphIsRunning, setGraphIsRunning] = useState(false);
  const workflowContext = useContext(WorkflowContext);
  const runGraph = useCallback(async () => {
    if (workflowContext.openedWorkflowItem === undefined) return;
    setGraphIsRunning(true);
    try {
      const { workspaceID, title } = workflowContext.openedWorkflowItem;
      const { id: networkID } = await window.service.workflow.addNetworkFromGraphTiddlerTitle(workspaceID, title);
      setCurrentNetworkID(networkID);
    } catch (error) {
      // TODO: show error on a debugger panel
      // network.once('process-error', onError);
      console.error(error);
      setGraphIsRunning(false);
    }
  }, [workflowContext.openedWorkflowItem]);
  const stopGraph = useCallback(async () => {
    if (currentNetworkID === undefined) return;
    // this may await forever, if some component have process that haven't call `output.done()` or return without calling `this.deactivate(context)`.
    await window.service.workflow.stopNetwork(currentNetworkID);
    setGraphIsRunning(false);
  }, [currentNetworkID]);
  useEffect(() => {
    return () => {
      // stop network when debug panel is closed
      void stopGraph();
      // TODO: delete this onetime debug workflow
    };
  }, [stopGraph]);
  return [runGraph, stopGraph, graphIsRunning, currentNetworkID] as const;
}
