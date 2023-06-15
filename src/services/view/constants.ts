import { WindowNames } from '@services/windows/WindowProperties';

export const setViewEventName = (workspaceID: string, windowName: WindowNames) => `setView-${workspaceID}-${windowName}`;
