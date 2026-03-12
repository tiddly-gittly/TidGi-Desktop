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
  const isEqualFunction = options?.isEqual ?? Object.is;
  const [localValue, setLocalValue] = useState<T>(serverValue);
  const isEditingReference = useRef(false);

  // Keep latest references so callbacks don't need to re-create
  const onCommitReference = useRef(onCommit);
  onCommitReference.current = onCommit;
  const isEqualReference = useRef(isEqualFunction);
  isEqualReference.current = isEqualFunction;
  const localValueReference = useRef(localValue);
  localValueReference.current = localValue;
  const serverValueReference = useRef(serverValue);
  serverValueReference.current = serverValue;
  // Captures localValue at the moment the user focused the field;
  // used on blur to detect whether the user actually made a change.
  const valueAtFocusReference = useRef<T>(serverValue);

  // Sync serverValue → localValue when not editing
  useEffect(() => {
    if (!isEditingReference.current) {
      setLocalValue(serverValue);
    }
  }, [serverValue]);

  const onFocus = useCallback(() => {
    isEditingReference.current = true;
    valueAtFocusReference.current = localValueReference.current;
  }, []);

  const onBlur = useCallback(() => {
    isEditingReference.current = false;
    if (!isEqualReference.current(localValueReference.current, valueAtFocusReference.current)) {
      // User changed the value — persist it
      onCommitReference.current(localValueReference.current);
    } else {
      // User did not change — sync to latest server value
      setLocalValue(serverValueReference.current);
    }
  }, []);

  return {
    localValue,
    setLocalValue,
    inputProps: { onFocus, onBlur },
    isDirty: !isEqualFunction(localValue, serverValue),
  };
}
