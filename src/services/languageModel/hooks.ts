import useObservable from 'beautiful-react-hooks/useObservable';
import { useCallback, useState } from 'react';
import { ILanguageModelAPIResponse, IRunLLAmaOptions, LanguageModelRunner } from './interface';

export function useLoadModelObservable() {
  const [value, valueSetter] = useState<ILanguageModelAPIResponse | undefined>();
  const loadModel = useCallback((runner: LanguageModelRunner, options: IRunLLAmaOptions) => {
    window.observables.languageModel.runLanguageModel$(runner, options).subscribe({
      next: valueSetter,
    });
  }, []);
  return [loadModel, value] as const;
}

export function useModelLoadProgressObservable() {
  const [value, valueSetter] = useState<Record<LanguageModelRunner, number> | undefined>();
  useObservable(window.observables.languageModel.modelLoadProgress$, valueSetter);
  return value;
}

export function useModelLoadedObservable() {
  const [value, valueSetter] = useState<Record<LanguageModelRunner, boolean> | undefined>();
  useObservable(window.observables.languageModel.modelLoaded$, valueSetter);
  return value;
}
