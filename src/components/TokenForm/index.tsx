import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Tab, ListItemText } from '@material-ui/core';
import { TabPanel, TabContext, TabList } from '@material-ui/lab';
import { SupportedStorageServices } from '@services/types';
import { useTranslation } from 'react-i18next';

const Container = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
`;
const TabsContainer = styled.div`
  display: flex;
  flex-direction: row;
`;

/**
 * Create storage provider's token.
 * @returns
 */
export function TokenForm(): JSX.Element {
  const { t } = useTranslation();
  const [currentTab, currentTabSetter] = useState<SupportedStorageServices>(SupportedStorageServices.github);
  return (
    <Container>
      <ListItemText primary={t('Preference.Token')} secondary={t('Preference.TokenDescription')} />
      <TabContext value={currentTab}>
        <TabsContainer>
          <TabList
            onChange={(_event, newValue) => currentTabSetter(newValue as SupportedStorageServices)}
            orientation="vertical"
            variant="scrollable"
            value={currentTab}
            aria-label="Vertical tabs example">
            <Tab label="GitHub" value={SupportedStorageServices.github} />
            <Tab label="GitLab" value={SupportedStorageServices.gitlab} />
            <Tab label="Gitee" value={SupportedStorageServices.gitee} />
          </TabList>
          <TabPanel value={SupportedStorageServices.github}>Item One</TabPanel>
          <TabPanel value={SupportedStorageServices.gitlab}>Item Two</TabPanel>
          <TabPanel value={SupportedStorageServices.gitee}>Item Two</TabPanel>
        </TabsContainer>
      </TabContext>
    </Container>
  );
}
