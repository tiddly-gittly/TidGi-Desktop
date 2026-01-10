import { isEqual } from 'lodash';
import type { IWikiWorkspace, IWorkspace } from './interface';
import { wikiWorkspaceDefaultValues } from './interface';

export const workspaceSorter = (a: IWorkspace, b: IWorkspace): number => a.order - b.order;

/**
 * Get only the fields that differ from defaults, for persisting to storage.
 * This reduces storage size and makes configs more readable by only storing non-default values.
 * @param workspace The workspace object with all fields
 * @returns An object containing only fields that differ from defaults
 */
export function getDifferencesFromDefaults(workspace: IWikiWorkspace): Partial<IWikiWorkspace> {
  const differences = {} as Partial<IWikiWorkspace>;
  const keys = Object.keys(workspace) as Array<keyof IWikiWorkspace>;

  keys.forEach((typedKey) => {
    const defaultValue = (wikiWorkspaceDefaultValues as Partial<IWikiWorkspace>)[typedKey];
    const workspaceValue = workspace[typedKey];

    // Include field if it has a value and differs from default, or if there's no default defined
    if (defaultValue === undefined || !isEqual(defaultValue, workspaceValue)) {
      (differences as unknown as Record<string, unknown>)[typedKey as string] = workspaceValue;
    }
  });

  return differences;
}
