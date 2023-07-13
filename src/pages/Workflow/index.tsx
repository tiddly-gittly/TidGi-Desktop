/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/promise-function-async */
import { useThemeObservable } from '@services/theme/hooks';
import { type Graph, loadJSON } from 'fbp-graph/lib/Graph';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IFBPLibrary } from 'the-graph';
import { GraphEditor } from './GraphEditor';
import { getBrowserComponentLibrary } from './library';
import { photoboothJSON } from './photobooth.json';

export default function Workflow(): JSX.Element {
  const { t } = useTranslation();
  const theme = useThemeObservable();

  const [graph, setGraph] = useState<Graph | undefined>();
  useEffect(() => {
    void loadJSON(photoboothJSON).then(graph => {
      setGraph(graph);
    });
  }, []);
  // load library bundled by webpack noflo-component-loader from installed noflo related npm packages
  const [library, setLibrary] = useState<IFBPLibrary | undefined>();
  useEffect(() => {
    void (async () => {
      const libraryToLoad = await getBrowserComponentLibrary();
      setLibrary(libraryToLoad);
    })();
  }, []);
  return graph && library
    ? (
      <>
        <GraphEditor theme={theme?.shouldUseDarkColors ? 'dark' : 'light'} library={library} graph={graph} setGraph={setGraph} />
      </>
    )
    : <div>{t('Loading')}</div>;
}
