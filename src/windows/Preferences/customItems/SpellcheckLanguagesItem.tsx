import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { ListItemButton } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { ListItemText } from '@/components/ListItem';
import { hunspellLanguagesMap } from '@/constants/hunspellLanguages';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';

export function SpellcheckLanguagesItem(): React.JSX.Element | null {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();

  if (preference === undefined) return null;

  return (
    <ListItemButton
      onClick={async () => {
        await window.service.window.open(WindowNames.spellcheck);
      }}
    >
      <ListItemText
        primary={t('Preference.SpellCheckLanguages')}
        secondary={preference.spellcheckLanguages.map((code) => hunspellLanguagesMap[code]).join(' | ')}
      />
      <ChevronRightIcon color='action' />
    </ListItemButton>
  );
}
