import React from 'react';
import { invert } from 'lodash';
import { useTranslation } from 'react-i18next';

import { Paper, AppBar, Tabs, Tab } from '@material-ui/core';

export enum CreateWorkspaceTabs {
  CloneOnlineWiki = 'CloneOnlineWiki',
  CreateNewWiki = 'CreateNewWiki',
  OpenLocalWiki = 'OpenLocalWiki',
}

const a11yProps = (
  index: CreateWorkspaceTabs,
): {
  id: string;
  'aria-controls': string;
} => ({
  id: index,
  'aria-controls': `simple-tabpanel-${index}`,
});

const tabIndexMap = {
  [CreateWorkspaceTabs.CloneOnlineWiki]: 0,
  [CreateWorkspaceTabs.CreateNewWiki]: 1,
  [CreateWorkspaceTabs.OpenLocalWiki]: 2,
};

export interface IProps {
  currentTab: CreateWorkspaceTabs;
  currentTabSetter: (id: CreateWorkspaceTabs) => void;
}
export function TabBar({ currentTab, currentTabSetter }: IProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <AppBar position="static">
      <Paper square>
        <Tabs
          value={tabIndexMap[currentTab]}
          onChange={(_event, newValue: number) => currentTabSetter((invert(tabIndexMap) as Record<number, CreateWorkspaceTabs>)[newValue])}
          aria-label={t('AddWorkspace.SwitchCreateNewOrOpenExisted')}>
          <Tab label={t(`AddWorkspace.CloneOnlineWiki`)} {...a11yProps(CreateWorkspaceTabs.CloneOnlineWiki)} />
          <Tab label={t('AddWorkspace.CreateNewWiki')} {...a11yProps(CreateWorkspaceTabs.CreateNewWiki)} />
          <Tab label={t('AddWorkspace.OpenLocalWiki')} {...a11yProps(CreateWorkspaceTabs.OpenLocalWiki)} />
        </Tabs>
      </Paper>
    </AppBar>
  );
}
