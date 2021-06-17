import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet';

import ButtonRaw from '@material-ui/core/Button';
import Checkbox from '@material-ui/core/Checkbox';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';

import { hunspellLanguagesMap, HunspellLanguages } from '../../constants/hunspellLanguages';
import { usePreferenceObservable } from '@services/preferences/hooks';

const Root = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
`;

const Top = styled(List)`
  flex: 1;
  overflow: auto;
`;
Top.defaultProps = {
  disablePadding: true,
  dense: true,
};

const Bottom = styled.div`
  display: fixed;
  z-index: 10;
  bottom: 0;
  left: 0;
  padding: 10px;
`;

const Button = styled(ButtonRaw)`
  float: right;
  margin-left: 10px;
`;
Button.defaultProps = {
  variant: 'contained',
  disableElevation: true,
};

export default function SpellcheckLanguages(): JSX.Element {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();
  if (preference === undefined) {
    return <Root>Loading...</Root>;
  }
  return (
    <Root>
      <div id="test" data-usage="For spectron automating testing" />
      <Helmet>
        <title>{t('Preference.SpellCheckLanguages')}</title>
      </Helmet>
      <Top>
        {(Object.keys(hunspellLanguagesMap) as HunspellLanguages[]).map((code) => (
          <ListItem
            dense
            key={code}
            button
            onClick={() => {
              if (preference.spellcheckLanguages.includes(code)) {
                void window.service.preference.set(
                  'spellcheckLanguages',
                  preference.spellcheckLanguages.filter((language) => language !== code),
                );
              } else {
                void window.service.preference.set('spellcheckLanguages', [...preference.spellcheckLanguages, code]);
              }
            }}>
            <ListItemIcon>
              <Checkbox
                edge="start"
                checked={preference.spellcheckLanguages.includes(code)}
                disabled={preference.spellcheckLanguages.length < 2 && preference.spellcheckLanguages.includes(code)}
              />
            </ListItemIcon>
            <ListItemText primary={hunspellLanguagesMap[code]} />
          </ListItem>
        ))}
      </Top>
      <Bottom>
        <Button color="primary" disabled>
          This Page is Auto Saved
        </Button>
        <Button onClick={async () => await window.remote.closeCurrentWindow()}>Close</Button>
      </Bottom>
    </Root>
  );
}
