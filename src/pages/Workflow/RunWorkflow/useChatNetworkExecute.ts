import { INetworkState } from '@services/workflow/interface';

/**
 * Add a network to the memory, and add to the database.
 *
 * @param workspaceID workspaceID containing the graphTiddler (its title is also the workflowID).
 * @returns new chat id
 */
export const addNewNetwork = async (workspaceID: string, graphTiddlerTitle: string): Promise<{ id: string; state: INetworkState }> => {
  return await window.service.workflow.addNetworkFromGraphTiddlerTitle(workspaceID, graphTiddlerTitle);
};
