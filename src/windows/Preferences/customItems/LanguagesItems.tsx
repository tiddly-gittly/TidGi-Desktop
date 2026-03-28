import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { ListItemButton, MenuItem, Select } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { hunspellLanguagesMap } from '@/constants/hunspellLanguages';
import { usePromiseValue } from '@/helpers/useServiceValue';
import type { ICustomItemProps } from '@services/preferences/definitions/types';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';
import { InputLabel } from '../PreferenceComponents';

export function LanguageSelectorItem(_props: ICustomItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();
  const supportedLanguagesMap = usePromiseValue(
    async () => await window.service.context.get('supportedLanguagesMap') as Record<string, string> | undefined,
    undefined,
  );

  if (preference === undefined || supportedLanguagesMap === undefined || preference.language === undefined) {
    return <ListItem>{t('Loading')}</ListItem>;
  }

  return (
    <ListItem sx={{ justifyContent: 'space-between' }}>
      <ListItemText primary={t('Preference.ChooseLanguage')} />
      <InputLabel sx={{ flex: 1 }} id='language-select-label'>
        {t('Preference.Languages')}
      </InputLabel>
      <Select
        sx={{ flex: 2 }}
        labelId='language-select-label'
        value={preference.language}
        onChange={async (event) => {
          await window.service.preference.set('language', event.target.value);
        }}
        autoWidth
      >
        {Object.keys(supportedLanguagesMap).map((languageID) => (
          <MenuItem value={languageID} key={languageID}>
            {supportedLanguagesMap[languageID]}
          </MenuItem>
        ))}
      </Select>
    </ListItem>
  );
}

export function SpellcheckLanguagesItem(_props: ICustomItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();

  if (preference === undefined) {
    return <ListItem>{t('Loading')}</ListItem>;
  }

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
