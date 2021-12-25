import { IWorkspace } from './interface';

export const workspaceSorter = (a: IWorkspace, b: IWorkspace): number => a.order - b.order;
