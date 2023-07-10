/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/promise-function-async */
import { useThemeObservable } from '@services/theme/hooks';
import { type Graph, loadJSON } from 'fbp-graph/lib/Graph';
import { ComponentLoader } from 'noflo';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IFBPLibrary } from 'the-graph';
import { GraphEditor } from './GraphEditor';
import { photoboothJSON } from './photobooth.json';

export default function Workflow(): JSX.Element {
  const { t } = useTranslation();
  const theme = useThemeObservable();

  const [library, setLibrary] = useState<IFBPLibrary | undefined>();
  const [graph, setGraph] = useState<Graph | undefined>();
  useEffect(() => {
    void loadJSON(photoboothJSON).then(graph => {
      setGraph(graph);
    });
  }, []);
  // load library bundled by webpack noflo-component-loader from installed noflo related npm packages
  useEffect(() => {
    const loader = new ComponentLoader('');
    void loader.listComponents().then((componentList) => {
      const libraryToLoad: IFBPLibrary = {};
      Object.entries(componentList).forEach(([name, componentDefinitionRaw]) => {
        if (typeof componentDefinitionRaw === 'string') {
          // TODO: handle these ComponentDefinition types
          return;
        }
        if ('getComponent' in componentDefinitionRaw) {
          const componentDefinition = componentDefinitionRaw.getComponent();
          libraryToLoad[name] = componentDefinition;
        }
      });
      setLibrary(libraryToLoad);
    });
  }, []);
  return graph && library
    ? (
      <>
        <GraphEditor theme={theme?.shouldUseDarkColors ? 'dark' : 'light'} library={library} graph={graph} />
      </>
    )
    : <div>{t('Loading')}</div>;
}
