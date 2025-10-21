import { useEffect } from 'react';
import { useTabStore } from '../store/tabStore';

/**
 * TabStoreInitializer component
 * This component initializes the tab store by loading data from the backend service.
 * It should be mounted near the root of your application.
 */
export function TabStoreInitializer() {
  const { initialize } = useTabStore();

  useEffect(() => {
    // Initialize the tab store when the component mounts
    initialize().catch((error: unknown) => {
      void window.service.native.log('error', 'Failed to initialize tab store', { function: 'TabStoreInitializer.initialize', error });
    });
  }, [initialize]);

  // This component doesn't render anything
  return null;
}
