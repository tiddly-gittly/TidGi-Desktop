
/**
 * Add a network to the memory, and add to the database.
 *
 * @param workspaceID workspaceID containing the graphTiddler (its title is also the workflowID).
 * @returns new chat id
 */
export const addNewNetwork = async (workspaceID: string, graphTiddlerTitle: string): Promise<string> => {
  const chatID = await window.service.workflow.addNetworkFromGraphTiddlerTitle(workspaceID, graphTiddlerTitle);
  return chatID;
};
