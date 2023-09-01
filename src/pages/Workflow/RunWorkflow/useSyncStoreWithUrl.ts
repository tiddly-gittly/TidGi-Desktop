/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { PageType } from '@services/pages/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { runRouteName } from './constants';
import { useChatsStore } from './useChatsStore';

export function useSyncStoreWithUrl() {
  const [match, parameters] = useRoute(`/${WindowNames.main}/${PageType.workflow}/${runRouteName}/:workflowID/:runID*/`);
  /**
   * This will be the active chat ID if the URL matches, otherwise it'll be undefined.
   */
  const activeRunIDFromUrl = parameters?.runID;
  const [activeChatID, setActiveChatID] = useChatsStore((state) => [state.activeChatID, state.setActiveChatID]);
  const workflowID = parameters?.workflowID;

  const [, setLocation] = useLocation();

  // When the component first mounts, sync the activeChatID with the runID from the URL
  useEffect(() => {
    if (activeRunIDFromUrl && activeRunIDFromUrl !== activeChatID) {
      setActiveChatID(activeRunIDFromUrl);
    }
  }, [activeRunIDFromUrl, setActiveChatID, activeChatID]);

  // When the activeChatID changes, update the URL to reflect this
  useEffect(() => {
    if (match && activeChatID && workflowID && activeChatID !== activeRunIDFromUrl) {
      setLocation(`/${WindowNames.main}/${PageType.workflow}/${runRouteName}/${workflowID}/${activeChatID}/`);
    }
  }, [activeChatID, setLocation, match, workflowID, activeRunIDFromUrl]);

  // When the user goes forward or backward in the browser, sync the store with the runID from the URL
  useEffect(() => {
    const handlePopState = () => {
      if (activeRunIDFromUrl && activeRunIDFromUrl !== activeChatID) {
        setActiveChatID(activeRunIDFromUrl);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [activeRunIDFromUrl, setActiveChatID, activeChatID]);

  return {
    activeChatID,
    workflowID,
  };
}
