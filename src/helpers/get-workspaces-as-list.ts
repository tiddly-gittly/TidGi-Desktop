// @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
const getWorkspacesAsList = (workspaces: any) => Object.values(workspaces).sort((a, b) => a.order - b.order);

export default getWorkspacesAsList;
