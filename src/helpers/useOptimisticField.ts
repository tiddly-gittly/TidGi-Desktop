import { useCallback, useEffect, useRef, useState } from 'react';

interface UseOptimisticFieldOptions<T> {
  /** Custom equality check. Defaults to `Object.is`. */
  isEqual?: (a: T, b: T) => boolean;
}

interface UseOptimisticFieldReturn<T> {
  localValue: T;
  setLocalValue: (value: T) => void;
  /** Spread onto the input element to enable focus/blur tracking */
  inputProps: {
    onFocus: () => void;
    onBlur: () => void;
  };
  isDirty: boolean;
}

/**
 * Manages a local field value that stays in sync with a server/observable value
 * while preventing overwrites during user editing.
 *
 * - While focused: serverValue changes are ignored, user edits locally.
 * - On blur: if dirty, calls onCommit(localValue). Otherwise syncs to serverValue.
 * - While not focused: serverValue changes are applied to localValue.
 */
export function useOptimisticField<T>(
  serverValue: T,
  onCommit: (value: T) => void,
  options?: UseOptimisticFieldOptions<T>,
): UseOptimisticFieldReturn<T> {
  const isEqualFn = options?.isEqual ?? Object.is;
  const [localValue, setLocalValue] = useState<T>(serverValue);
  const isEditingRef = useRef(false);

  // Keep latest references so callbacks don't need to re-create
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const isEqualRef = useRef(isEqualFn);
  isEqualRef.current = isEqualFn;
  const localValueRef = useRef(localValue);
  localValueRef.current = localValue;
  const serverValueRef = useRef(serverValue);
  serverValueRef.current = serverValue;

  // Sync serverValue → localValue when not editing
  useEffect(() => {
    if (!isEditingRef.current) {
      setLocalValue(serverValue);
    }
  }, [serverValue]);

  const onFocus = useCallback(() => {
    isEditingRef.current = true;
  }, []);

  const onBlur = useCallback(() => {
    isEditingRef.current = false;
    if (!isEqualRef.current(localValueRef.current, serverValueRef.current)) {
      onCommitRef.current(localValueRef.current);
    }
  }, []);

  return {
    localValue,
    setLocalValue,
    inputProps: { onFocus, onBlur },
    isDirty: !isEqualFn(localValue, serverValue),
  };
}
