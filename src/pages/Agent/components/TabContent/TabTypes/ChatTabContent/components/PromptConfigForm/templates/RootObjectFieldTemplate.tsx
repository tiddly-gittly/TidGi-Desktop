import { Box, Tab, Tabs, Typography } from '@mui/material';
import { ObjectFieldTemplateProps } from '@rjsf/utils';
import React, { useState } from 'react';
import { HelpTooltip } from '../components';

export const RootObjectFieldTemplate: React.FC<ObjectFieldTemplateProps> = (props) => {
  const { properties, title, schema } = props;
  const [activeTab, setActiveTab] = useState(0);

  const description = schema.description;

  if (!title || properties.length === 0) {
    return (
      <Box sx={{ width: '100%' }}>
        {properties.map((element) => (
          <Box key={element.name} sx={{ mb: 2 }}>
            {element.content}
          </Box>
        ))}
      </Box>
    );
  }

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      {title && (
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant='h6' component='h2'>
            {title}
          </Typography>
          {typeof description === 'string' && description && <HelpTooltip description={description} />}
        </Box>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant='scrollable'
          scrollButtons='auto'
          aria-label='configuration sections'
        >
          {properties.map((element, index) => (
            <Tab
              key={element.name}
              label={element.name}
              id={`config-tab-${index}`}
              aria-controls={`config-tabpanel-${index}`}
              sx={{ textTransform: 'none', minWidth: 120 }}
            />
          ))}
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
