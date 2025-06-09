import { Box, Grid } from '@mui/material';
import { ObjectFieldTemplateProps } from '@rjsf/utils';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { HelpTooltip, StyledCard, StyledCardContent, StyledFieldLabel } from '../components';
import { useArrayItemContext } from '../context/ArrayItemContext';

export const ObjectFieldTemplate: React.FC<ObjectFieldTemplateProps> = (props) => {
  const { properties, schema, uiSchema } = props;
  const { t } = useTranslation('agent');
  const { isInArrayItem } = useArrayItemContext();
  // Check if this should use compact layout
  const compactFieldsValue = uiSchema?.['ui:compactFields'] as unknown;
  const compactFields = Array.isArray(compactFieldsValue) ? (compactFieldsValue as string[]) : [];
  const useCompactLayout = compactFields.length > 0;

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
      <StyledCardContent>
        {schema.title && (
          <Box sx={{ mb: 2 }}>
            <StyledFieldLabel
              sx={{
                fontSize: '1.1rem',
                fontWeight: 'bold',
                mb: 1,
                display: 'block',
              }}
            >
              {t(schema.title)}
              {schema.description && <HelpTooltip description={t(schema.description)} />}
            </StyledFieldLabel>
          </Box>
        )}
        {renderProperties()}
      </StyledCardContent>
    </StyledCard>
  );
};
