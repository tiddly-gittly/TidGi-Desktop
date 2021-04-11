import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Paper, Typography, Tabs, Tab, TabPanel } from '@material-ui/core';
import SearchRepo from '@/components/github/SearchRepo';
import { SupportedStorageServices } from '@services/types';

const Container = styled(Paper)`
  margin-top: 5px;
`;
const GithubRepoLink = styled(Typography)`
  cursor: pointer;
  opacity: 50%;
  &:hover {
    opacity: 100%;
  }
`;

const a11yProps = (
  index: SupportedStorageServices,
): {
  id: string;
  'aria-controls': string;
} => ({
  id: index,
  'aria-controls': `simple-tabpanel-${index}`,
});

/**
 * Create storage provider's token.
 * @returns
 */
export function TokenForm(): JSX.Element {
  const [currentTab, currentTabSetter] = useState<SupportedStorageServices>(SupportedStorageServices.github);
  return (
    <Container elevation={2} square>
      <Tabs
        orientation="vertical"
        variant="scrollable"
        value={currentTab}
        onChange={(_event, newValue: SupportedStorageServices) => currentTabSetter(newValue)}
        aria-label="Vertical tabs example">
        <Tab label="GitHub" {...a11yProps(SupportedStorageServices.github)} />
        <Tab label="GitLab" {...a11yProps(SupportedStorageServices.gitlab)} />
      </Tabs>
      <TabPanel value={currentTab} index={0}>
        Item One
      </TabPanel>
      <TabPanel value={currentTab} index={1}>
        Item Two
      </TabPanel>
    </Container>
  );
}
