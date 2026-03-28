import { MenuItem, Select } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { InputLabel } from '../PreferenceComponents';

export function LanguageSelectorItem(): React.JSX.Element | null {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();
  const supportedLanguagesMap = usePromiseValue(
    async () => await window.service.context.get('supportedLanguagesMap') as Record<string, string> | undefined,
  );

  if (preference === undefined || supportedLanguagesMap === undefined || preference.language === undefined) return null;

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
