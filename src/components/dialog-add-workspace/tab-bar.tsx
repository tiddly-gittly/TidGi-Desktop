import React from 'react';
import { invert } from 'lodash';
import { useTranslation } from 'react-i18next';

import Paper from '@material-ui/core/Paper';
import AppBar from '@material-ui/core/AppBar';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';

function a11yProps(index: any) {
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
  currentTabSetter: (id: string) => void;
}
export default function TabBar({ currentTab, currentTabSetter }: IProps) {
  const { t } = useTranslation();
  return (
    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <AppBar position="static">
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Paper square>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Tabs
          // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
          value={tabIndexMap[currentTab]}
          onChange={(event, newValue) => currentTabSetter(invert(tabIndexMap)[newValue])}
          aria-label={t('AddWorkspace.SwitchCreateNewOrOpenExisted')}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Tab label={t('AddWorkspace.CloneOnlineWiki')} {...a11yProps('CloneOnlineWiki')} />
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Tab label={t('AddWorkspace.CreateNewWiki')} {...a11yProps('CreateNewWiki')} />
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Tab label={t('AddWorkspace.OpenLocalWiki')} {...a11yProps('OpenLocalWiki')} />
        </Tabs>
      </Paper>
    </AppBar>
  );
}
