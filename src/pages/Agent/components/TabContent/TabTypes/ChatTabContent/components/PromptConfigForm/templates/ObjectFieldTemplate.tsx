import { Box, Grid, Typography } from '@mui/material';
import { ObjectFieldTemplateProps } from '@rjsf/utils';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapseIcon, ExpandIcon, HelpTooltip, StyledCard, StyledCardContent, StyledCollapse, StyledExpandButton } from '../components';
import { useArrayItemContext } from '../context/ArrayItemContext';

export const ObjectFieldTemplate: React.FC<ObjectFieldTemplateProps> = (props) => {
  const { properties, title, schema, uiSchema } = props;
  const [expanded, setExpanded] = useState(true);
  const { t } = useTranslation('agent');
  const { isInArrayItem } = useArrayItemContext();

  // Only allow collapsing if not in array item (since array item has its own collapse control)
  const isCollapsible = uiSchema?.['ui:collapsible'] !== false && !isInArrayItem;
  const description = schema.description;

  // Check if this should use compact layout
  const compactFieldsValue = uiSchema?.['ui:compactFields'] as unknown;
  const compactFields = Array.isArray(compactFieldsValue) ? (compactFieldsValue as string[]) : [];
  const useCompactLayout = compactFields.length > 0;

  const handleToggleExpanded = () => {
    setExpanded(!expanded);
  };

  // DEBUG: console title
  console.log(`title`, title);

  const titleWithHelp = (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant='subtitle1' component='h3'>
          {t(title)}
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

  const renderProperties = () => {
    if (!useCompactLayout) {
      // Default vertical layout
      return properties.map((element) => (
        <Box key={element.name} sx={{ mb: isInArrayItem ? 0.25 : 0.5 }}>
          {element.content}
        </Box>
      ));
    }

    // Compact layout: separate compact fields from full-width fields
    const compactProps: typeof properties = [];
    const fullWidthProps: typeof properties = [];

    properties.forEach((element) => {
      if (compactFields.includes(element.name)) {
        compactProps.push(element);
      } else {
        fullWidthProps.push(element);
      }
    });

    return (
      <>
        {/* Render compact fields in 2-column grid */}
        {compactProps.length > 0 && (
          <Grid container spacing={2} sx={{ mb: 1 }}>
            {compactProps.map((element) => (
              <Grid size={6} key={element.name}>
                {element.content}
              </Grid>
            ))}
          </Grid>
        )}

        {/* Render full-width fields */}
        {fullWidthProps.map((element) => (
          <Box key={element.name} sx={{ mb: isInArrayItem ? 0.25 : 0.5 }}>
            {element.content}
          </Box>
        ))}
      </>
    );
  };

  return (
    <StyledCard variant='outlined'>
      {titleWithHelp}
      <StyledCollapse in={expanded} timeout='auto' unmountOnExit>
        <StyledCardContent>
          {renderProperties()}
        </StyledCardContent>
      </StyledCollapse>
    </StyledCard>
  );
};
