import { styled } from '@mui/material/styles';

import { useRestartSnackbar } from '@/components/RestartSnackbar';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { Languages } from '../../windows/Preferences/sections/Languages';
import { TiddlyWiki } from '../../windows/Preferences/sections/TiddlyWiki';
import { NewUserMessage } from './NewUserMessage';

const InnerContentRoot = styled('div')`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px;
  width: 100%;
  height: 100%;
`;

export default function Guide(): React.JSX.Element {
  const workspacesList = useWorkspacesListObservable();
  const preferences = usePreferenceObservable();
  const [requestRestartCountDown, RestartSnackbar] = useRestartSnackbar();
  return (
    <>
      <InnerContentRoot>
        {preferences !== undefined && Array.isArray(workspacesList) && workspacesList.length === 0 && (
          <NewUserMessage sidebar={preferences.sidebar} themeSource={preferences.themeSource} />
        )}
      </InnerContentRoot>
      <Languages languageSelectorOnly />
      <TiddlyWiki requestRestartCountDown={requestRestartCountDown} />
      {RestartSnackbar}
    </>
  );
}
