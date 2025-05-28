import { Box, Typography } from '@mui/material';
import { ObjectFieldTemplateProps } from '@rjsf/utils';
import React, { useState } from 'react';
import { CollapseIcon, ExpandIcon, HelpTooltip, StyledCard, StyledCardContent, StyledCollapse, StyledExpandButton } from '../components';

export const ObjectFieldTemplate: React.FC<ObjectFieldTemplateProps> = (props) => {
  const { properties, title, schema, uiSchema } = props;
  const [expanded, setExpanded] = useState(true);

  const isCollapsible = uiSchema?.['ui:collapsible'] !== false;
  const description = schema.description;

  const handleToggleExpanded = () => {
    setExpanded(!expanded);
  };

  if (!title) {
    return (
      <Box sx={{ width: '100%' }}>
        {properties.map((element) => (
          <Box key={element.name} sx={{ mb: 1 }}>
            {element.content}
          </Box>
        ))}
      </Box>
    );
  }

  const titleWithHelp = (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant='subtitle1' component='h3'>
          {title}
        </Typography>
        {typeof description === 'string' && description && <HelpTooltip description={description} />}
      </Box>
      {isCollapsible && (
        <StyledExpandButton onClick={handleToggleExpanded}>
          {expanded ? <CollapseIcon /> : <ExpandIcon />}
        </StyledExpandButton>
      )}
    </Box>
  );

  return (
    <StyledCard variant='outlined'>
      {titleWithHelp}
      <StyledCollapse in={expanded} timeout='auto' unmountOnExit>
        <StyledCardContent>
          {properties.map((element) => (
            <Box key={element.name} sx={{ mb: 1 }}>
              {element.content}
            </Box>
          ))}
        </StyledCardContent>
      </StyledCollapse>
    </StyledCard>
  );
};
