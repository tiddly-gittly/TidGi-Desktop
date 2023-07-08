/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/promise-function-async */
import { useThemeObservable } from '@services/theme/hooks';
import { useTranslation } from 'react-i18next';
import { GraphEditor } from './GraphEditor';

export default function Workflow(): JSX.Element {
  const { t } = useTranslation();
  const theme = useThemeObservable();
  return (
    <>
      <GraphEditor theme={theme?.shouldUseDarkColors ? 'dark' : 'light'} />
    </>
  );
}
