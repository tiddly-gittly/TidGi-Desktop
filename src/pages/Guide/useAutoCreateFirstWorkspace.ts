/* eslint-disable @typescript-eslint/promise-function-async */
import { usePromiseValue } from '@/helpers/useServiceValue';
import { SupportedStorageServices } from '@services/types';
import { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { useEffect, useState } from 'react';
import { useWikiWorkspaceForm } from '../AddWorkspace/useForm';
import { INewWikiRequiredFormData, useNewWiki } from '../AddWorkspace/useNewWiki';

export function useAutoCreateFirstWorkspace(workspacesList: IWorkspaceWithMetadata[] | undefined, wikiCreationMessageSetter: (m: string) => void): void {
  const form = useWikiWorkspaceForm();
  const DEFAULT_FIRST_WIKI_PATH = usePromiseValue<string | undefined>(() => window.service.context.get('DEFAULT_FIRST_WIKI_PATH'));
  const DEFAULT_WIKI_FOLDER = usePromiseValue<string | undefined>(() => window.service.context.get('DEFAULT_WIKI_FOLDER'))!;
  const defaultNewWorkspaceConfig: INewWikiRequiredFormData = {
    ...form,
    wikiFolderName: 'wiki',
    wikiFolderLocation: DEFAULT_FIRST_WIKI_PATH,
    parentFolderLocation: DEFAULT_WIKI_FOLDER,
    storageProvider: SupportedStorageServices.local,
    wikiPort: 5212,
  };

  /** allow user delete all workspace, to enter the empty list state. */
  const [created, createdSetter] = useState(false);
  const onSubmit = useNewWiki(true, false, defaultNewWorkspaceConfig, wikiCreationMessageSetter, undefined, undefined, { notClose: true });

  useEffect(() => {
    if (created) return;
    // skip this logic if already have workspaces
    if (workspacesList?.length !== undefined && workspacesList?.length > 0) {
      createdSetter(true);
      return;
    }
    // if is first opened (or page refreshed) with empty workspace list, create one
    if (DEFAULT_WIKI_FOLDER === undefined || DEFAULT_FIRST_WIKI_PATH === undefined) return;
    if (workspacesList?.length === 0) {
      createdSetter(true);
      void onSubmit()
    }
  }, [workspacesList?.length, created, createdSetter, onSubmit, DEFAULT_WIKI_FOLDER, DEFAULT_FIRST_WIKI_PATH]);
}
