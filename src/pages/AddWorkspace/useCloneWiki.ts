import { useCallback } from 'react';
export function useCloneWiki(): [() => void] {
  const onSubmit = useCallback(async () => {
    if (!userInfo) {
      setWikiCreationMessage(t('AddWorkspace.NotLoggedIn'));
      return;
    }

    try {
      await window.service.wiki.cloneWiki(parentFolderLocation, wikiFolderName, githubWikiUrl, userInfo);
      save(workspaceFormData);
    } catch (error) {
      setWikiCreationMessage(String(error));
    }
  });

  return [onSubmit];
}
