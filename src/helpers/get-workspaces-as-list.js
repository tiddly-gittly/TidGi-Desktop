const getWorkspacesAsList = (workspaces) => Object.values(workspaces)
  .sort((a, b) => a.order - b.order);

export default getWorkspacesAsList;
