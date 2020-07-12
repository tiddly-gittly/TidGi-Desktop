// @flow
import React from 'react';
import Paper from '@material-ui/core/Paper';
import AppBar from '@material-ui/core/AppBar';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';

function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`,
  };
}

export interface IProps {
  currentTab: number;
  currentTabSetter: number => void;
}
export default function TabBar({ currentTab, currentTabSetter }: IProps) {
  return (
    <AppBar position="static">
      <Paper square>
        <Tabs
          value={currentTab}
          onChange={(event, newValue) => currentTabSetter(newValue)}
          aria-label="切换创建新的还是打开现有的WIKI"
        >
          <Tab label="创建新WIKI" {...a11yProps(0)} />
          <Tab label="打开现有WIKI" {...a11yProps(1)} />
        </Tabs>
      </Paper>
    </AppBar>
  );
}
