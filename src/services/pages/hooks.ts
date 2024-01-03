import useObservable from 'beautiful-react-hooks/useObservable';
import { useCallback, useState } from 'react';
import { IPage } from './interface';

export function usePagesListObservable(): IPage[] | undefined {
  const [pages, pagesSetter] = useState<IPage[] | undefined>();
  const setter = useCallback((newPages: IPage[]) => {
    pagesSetter(newPages.sort((a, b) => a.order - b.order));
  }, []);
  useObservable(window.observables.pages.pages$, setter);
  return pages;
}
