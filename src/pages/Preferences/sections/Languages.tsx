import { useTranslation } from 'react-i18next';
import { Divider, InputLabel, List, ListItem, ListItemSecondaryAction, ListItemText, MenuItem, Select, Switch } from '@material-ui/core';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';

import type { ISectionProps } from '../useSections';
import { Paper, SectionTitle } from '../PreferenceComponents';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';
import { hunspellLanguagesMap } from '@/constants/hunspellLanguages';
import { usePromiseValue } from '@/helpers/useServiceValue';

export function Languages(props: Required<ISectionProps>): JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));

  return (
    <>
      <SectionTitle ref={props.sections.languages.ref}>{t('Preference.Languages')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined || platform === undefined ? (
            <ListItem>{t('Loading')}</ListItem>
          ) : (
            <>
              <ListItem>
                <ListItemText primary={t('Preference.ChooseLanguage')} />
                <ListItemSecondaryAction>
                  <InputLabel id="demo-simple-select-label">{t('Preference.Languages')}</InputLabel>
                  <Select labelId="demo-simple-select-label" id="demo-simple-select" value={age} label="Age" onChange={handleChange}>
                    <MenuItem value={10}>Ten</MenuItem>
                    <MenuItem value={20}>Twenty</MenuItem>
                    <MenuItem value={30}>Thirty</MenuItem>
                  </Select>
                </ListItemSecondaryAction>
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemText primary={t('Preference.SpellCheck')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge="end"
                    color="primary"
                    checked={preference.spellcheck}
                    onChange={async (event) => {
                      await window.service.preference.set('spellcheck', event.target.checked);
                      props.requestRestartCountDown();
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              {platform !== 'darwin' && (
                <>
                  <Divider />
                  <ListItem button onClick={async () => await window.service.window.open(WindowNames.spellcheck)}>
                    <ListItemText
                      primary={t('Preference.SpellCheckLanguages')}
                      secondary={preference.spellcheckLanguages.map((code) => hunspellLanguagesMap[code]).join(' | ')}
                    />
                    <ChevronRightIcon color="action" />
                  </ListItem>
                </>
              )}
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
