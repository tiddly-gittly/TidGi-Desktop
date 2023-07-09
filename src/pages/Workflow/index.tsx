/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/promise-function-async */
import { useThemeObservable } from '@services/theme/hooks';
import { Graph } from 'fbp-graph';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IFBPLibrary } from 'the-graph';
import { GraphEditor } from './GraphEditor';
import { loadGraphJSON } from './loadGraph';
import { photoboothJSON } from './photobooth.json';

export default function Workflow(): JSX.Element {
  const { t } = useTranslation();
  const theme = useThemeObservable();

  const [library, setLibrary] = useState<IFBPLibrary | undefined>();
  const [graph, setGraph] = useState<Graph | undefined>();
  useEffect(() => {
    void loadGraphJSON(photoboothJSON).then(([graph, library]) => {
      setLibrary(library);
      setGraph(graph);
    });
  }, []);
  return graph
    ? (
      <>
        <GraphEditor theme={theme?.shouldUseDarkColors ? 'dark' : 'light'} library={library} graph={graph} />
      </>
    )
    : <div>{t('Loading')}</div>;
}
