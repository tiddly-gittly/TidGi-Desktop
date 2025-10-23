import { useUserInfoObservable } from '@services/auth/hooks';
import { IUserInfos } from '@services/auth/interface';
import { SupportedStorageServices } from '@services/types';
import { useCallback, useEffect, useRef, useState } from 'react';

interface TokenFormState {
  branch: string;
  email: string;
  token: string;
  userName: string;
}

interface UseTokenFormReturn extends TokenFormState {
  branchSetter: (value: string) => void;
  emailSetter: (value: string) => void;
  isLoggedIn: boolean;
  isReady: boolean;
  tokenSetter: (value: string) => void;
  userNameSetter: (value: string) => void;
}

/**
 * Custom hook for managing token form state
 * Handles sync between userInfo observable and local form state
 * Uses uncontrolled updates with useRef to prevent input lag
 */
export function useTokenForm(storageService: SupportedStorageServices): UseTokenFormReturn {
  const userInfo = useUserInfoObservable();

  // Local state for form inputs
  const [state, setState] = useState<TokenFormState>({
    token: '',
    userName: '',
    email: '',
    branch: '',
  });

  // Track if we're ready (userInfo loaded)
  const isReady = userInfo !== undefined;

  // Check if user is logged in
  const isLoggedIn = state.token.length > 0;

  // Use ref to track pending updates to avoid excessive re-renders
  const pendingUpdatesReference = useRef<Partial<IUserInfos>>({});
  const updateTimeoutReference = useRef<NodeJS.Timeout | null>(null);

  // Debounced update function
  const scheduleUpdate = useCallback(() => {
    if (updateTimeoutReference.current) {
      clearTimeout(updateTimeoutReference.current);
    }

    updateTimeoutReference.current = setTimeout(() => {
      const updates = pendingUpdatesReference.current;
      if (Object.keys(updates).length > 0) {
        // Batch all updates into a single call
        Object.entries(updates).forEach(([key, value]) => {
          void window.service.auth.set(key as keyof IUserInfos, value);
        });
        pendingUpdatesReference.current = {};
      }
    }, 500);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutReference.current) {
        clearTimeout(updateTimeoutReference.current);
      }
    };
  }, []);

  // Sync userInfo changes to local state (only when userInfo changes from backend)
  useEffect(() => {
    if (!userInfo) {
      void window.service.native.log('debug', 'useTokenForm: userInfo is undefined', {
        function: 'useTokenForm.useEffect',
        storageService,
      });
      return;
    }

    const newToken = userInfo[`${storageService}-token`] ?? '';
    const newUserName = userInfo[`${storageService}-userName`] ?? '';
    const newEmail = userInfo[`${storageService}-email`] ?? '';
    const newBranch = userInfo[`${storageService}-branch`] ?? '';

    void window.service.native.log('debug', 'useTokenForm: userInfo changed', {
      function: 'useTokenForm.useEffect',
      storageService,
      hasToken: !!newToken,
      tokenLength: newToken.length,
      hasUserName: !!newUserName,
      hasEmail: !!newEmail,
      hasBranch: !!newBranch,
    });

    // Only update if values actually changed
    setState((currentState) => {
      const updates: Partial<TokenFormState> = {};
      let hasChanges = false;

      if (currentState.token !== newToken) {
        updates.token = newToken;
        hasChanges = true;
        void window.service.native.log('debug', 'useTokenForm: token changed', {
          function: 'useTokenForm.useEffect',
          storageService,
          oldLength: currentState.token.length,
          newLength: newToken.length,
        });
      }
      if (currentState.userName !== newUserName) {
        updates.userName = newUserName;
        hasChanges = true;
      }
      if (currentState.email !== newEmail) {
        updates.email = newEmail;
        hasChanges = true;
      }
      if (currentState.branch !== newBranch) {
        updates.branch = newBranch;
        hasChanges = true;
      }

      if (hasChanges) {
        void window.service.native.log('info', 'useTokenForm: state updated with new values', {
          function: 'useTokenForm.useEffect',
          storageService,
          updates: Object.keys(updates),
        });
      }

      return hasChanges ? { ...currentState, ...updates } : currentState;
    });
  }, [userInfo, storageService]);

  // Optimized setters - update local state immediately, debounce backend updates
  const tokenSetter = useCallback(
    (value: string) => {
      setState((previous) => ({ ...previous, token: value }));
      pendingUpdatesReference.current[`${storageService}-token`] = value;
      scheduleUpdate();
    },
    [storageService, scheduleUpdate],
  );

  const userNameSetter = useCallback(
    (value: string) => {
      setState((previous) => ({ ...previous, userName: value }));
      pendingUpdatesReference.current[`${storageService}-userName`] = value;
      scheduleUpdate();
    },
    [storageService, scheduleUpdate],
  );

  const emailSetter = useCallback(
    (value: string) => {
      setState((previous) => ({ ...previous, email: value }));
      pendingUpdatesReference.current[`${storageService}-email`] = value;
      scheduleUpdate();
    },
    [storageService, scheduleUpdate],
  );

  const branchSetter = useCallback(
    (value: string) => {
      setState((previous) => ({ ...previous, branch: value }));
      pendingUpdatesReference.current[`${storageService}-branch`] = value;
      scheduleUpdate();
    },
    [storageService, scheduleUpdate],
  );

  return {
    ...state,
    isLoggedIn,
    isReady,
    tokenSetter,
    userNameSetter,
    emailSetter,
    branchSetter,
  };
}
