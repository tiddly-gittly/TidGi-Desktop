import { Box, Tab, Tabs } from '@mui/material';
import { ObjectFieldTemplateProps } from '@rjsf/utils';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useAgentChatStore } from '../../../../Agent/store/agentChatStore/index';

export const RootObjectFieldTemplate: React.FC<ObjectFieldTemplateProps> = (props) => {
  const { properties, schema } = props;
  const [activeTab, setActiveTab] = useState(0);
  const { t } = useTranslation('agent');

  const { formFieldsToScrollTo } = useAgentChatStore(
    useShallow((state) => ({
      formFieldsToScrollTo: state.formFieldsToScrollTo,
    })),
  );

  useEffect(() => {
    if (formFieldsToScrollTo.length > 0) {
      const targetTab = formFieldsToScrollTo[0];
      const tabIndex = properties.findIndex(property => property.name === targetTab);
      if (tabIndex !== -1 && tabIndex !== activeTab) {
        setActiveTab(tabIndex);
      }
    }
  }, [formFieldsToScrollTo, properties, activeTab]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant='scrollable'
          scrollButtons='auto'
          aria-label='configuration sections'
        >
          {properties.map((element, index) => {
            const fieldSchema = schema.properties?.[element.name];
            const title = typeof fieldSchema === 'object' && fieldSchema.title ? t(fieldSchema.title) : element.name;
            return (
              <Tab
                key={element.name}
                label={title}
                id={`config-tab-${index}`}
                aria-controls={`config-tabpanel-${index}`}
                sx={{ textTransform: 'none', minWidth: 120 }}
              />
            );
          })}
        </Tabs>
      </Box>

      {properties.map((element, index) => (
        <Box
          key={element.name}
          role='tabpanel'
          hidden={activeTab !== index}
          id={`config-tabpanel-${index}`}
          aria-labelledby={`config-tab-${index}`}
          sx={{ width: '100%' }}
        >
          {activeTab === index && element.content}
        </Box>
      ))}
    </Box>
  );
};
