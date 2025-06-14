import { Helmet } from '@dr.pogodin/react-helmet';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { styled } from '@mui/material/styles';

import ButtonRaw from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import List from '@mui/material/List';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';

import { ListItemButton } from '@mui/material';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { HunspellLanguages, hunspellLanguagesMap } from '../../constants/hunspellLanguages';

const Root = styled('div')`
  display: flex;
  flex-direction: column;
  height: 100vh;
`;

const Top = styled((props: React.ComponentProps<typeof List>) => <List disablePadding dense {...props} />)`
  flex: 1;
  overflow: auto;
`;

const Bottom = styled('div')`
  display: fixed;
  z-index: 10;
  bottom: 0;
  left: 0;
  padding: 10px;
`;

const Button = styled((props: React.ComponentProps<typeof ButtonRaw>) => <ButtonRaw {...props} />)`
  float: right;
  margin-left: 10px;
`;

export default function SpellcheckLanguages(): React.JSX.Element {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();
  if (preference === undefined) {
    return <Root>{t('Loading')}</Root>;
  }
  return (
    <Root>
      <div id='test' data-usage='For spectron automating testing' />
      <Helmet>
        <title>{t('Preference.SpellCheckLanguages')}</title>
      </Helmet>
      <Top>
        {(Object.keys(hunspellLanguagesMap) as HunspellLanguages[]).map((code) => (
          <ListItemButton
            dense
            key={code}
            onClick={() => {
              if (preference.spellcheckLanguages.includes(code)) {
                void window.service.preference.set(
                  'spellcheckLanguages',
                  preference.spellcheckLanguages.filter((language) => language !== code),
                );
              } else {
                void window.service.preference.set('spellcheckLanguages', [...preference.spellcheckLanguages, code]);
              }
            }}
          >
            <ListItemIcon>
              <Checkbox
                edge='start'
                checked={preference.spellcheckLanguages.includes(code)}
                disabled={preference.spellcheckLanguages.length < 2 && preference.spellcheckLanguages.includes(code)}
              />
            </ListItemIcon>
            <ListItemText primary={hunspellLanguagesMap[code]} />
          </ListItemButton>
        ))}
      </Top>
      <Bottom>
        <Button color='primary' disabled variant='contained' disableElevation>
          This Page is Auto Saved
        </Button>
        <Button
          variant='contained'
          disableElevation
          onClick={async () => {
            await window.remote.closeCurrentWindow();
          }}
        >
          Close
        </Button>
      </Bottom>
    </Root>
  );
}
