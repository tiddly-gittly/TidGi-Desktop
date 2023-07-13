import { Divider, List, ListItemSecondaryAction, MenuItem, Select, Switch } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { hunspellLanguagesMap } from '@/constants/hunspellLanguages';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';
import { InputLabel, Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function Languages(props: Partial<ISectionProps> & { languageSelectorOnly?: boolean }): JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();
  const [platform, supportedLanguagesMap]: [string | undefined, Record<string, string> | undefined] = usePromiseValue(
    async (): Promise<[string | undefined, Record<string, string> | undefined]> =>
      await Promise.all([window.service.context.get('platform'), window.service.context.get('supportedLanguagesMap')]),
    [undefined, undefined],
  );

  return (
    <>
      <SectionTitle ref={props.sections?.languages?.ref}>{t('Preference.Languages')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined || platform === undefined || supportedLanguagesMap === undefined || preference.language === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItem sx={{ justifyContent: 'space-between' }}>
                <ListItemText primary={t('Preference.ChooseLanguage')} />
                <InputLabel sx={{ flex: 1 }} id='demo-simple-select-label'>
                  {t('Preference.Languages')}
                </InputLabel>
                <Select
                  sx={{ flex: 2 }}
                  labelId='demo-simple-select-label'
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
              {props.languageSelectorOnly !== true && (
                <>
                  <Divider />
                  <ListItem>
                    <ListItemText primary={t('Preference.SpellCheck')} />
                    <ListItemSecondaryAction>
                      <Switch
                        edge='end'
                        color='primary'
                        checked={preference.spellcheck}
                        onChange={async (event) => {
                          await window.service.preference.set('spellcheck', event.target.checked);
                          props?.requestRestartCountDown?.();
                        }}
                      />
                    </ListItemSecondaryAction>
                  </ListItem>
                  {platform !== 'darwin' && (
                    <>
                      <Divider />
                      <ListItem
                        button
                        onClick={async () => {
                          await window.service.window.open(WindowNames.spellcheck);
                        }}
                      >
                        <ListItemText
                          primary={t('Preference.SpellCheckLanguages')}
                          secondary={preference.spellcheckLanguages.map((code) => hunspellLanguagesMap[code]).join(' | ')}
                        />
                        <ChevronRightIcon color='action' />
                      </ListItem>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
