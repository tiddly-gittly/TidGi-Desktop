// @flow
import React from 'react';
import { invert } from 'lodash';
import { useTranslation } from 'react-i18next';

import Paper from '@material-ui/core/Paper';
import AppBar from '@material-ui/core/AppBar';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';

function a11yProps(index) {
  return {
    id: index,
    'aria-controls': `simple-tabpanel-${index}`,
  };
}

const tabIndexMap = {
  CloneOnlineWiki: 0,
  CreateNewWiki: 1,
  OpenLocalWiki: 2,
};

export interface IProps {
  currentTab: string;
  currentTabSetter: string => void;
}
export default function TabBar({ currentTab, currentTabSetter }: IProps) {
  const { t } = useTranslation();
  return (
    <AppBar position="static">
      <Paper square>
        <Tabs
          value={tabIndexMap[currentTab]}
          onChange={(event, newValue) => currentTabSetter(invert(tabIndexMap)[newValue])}
          aria-label={t('AddWorkspace.SwitchCreateNewOrOpenExisted')}
        >
          <Tab label={t('AddWorkspace.CloneOnlineWiki')} {...a11yProps('CloneOnlineWiki')} />
          <Tab label={t('AddWorkspace.CreateNewWiki')} {...a11yProps('CreateNewWiki')} />
          <Tab label={t('AddWorkspace.OpenLocalWiki')} {...a11yProps('OpenLocalWiki')} />
        </Tabs>
      </Paper>
    </AppBar>
  );
}
