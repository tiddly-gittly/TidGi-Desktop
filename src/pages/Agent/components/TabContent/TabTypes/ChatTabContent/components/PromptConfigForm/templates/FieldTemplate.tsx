import { Box } from '@mui/material';
import { FieldTemplateProps } from '@rjsf/utils';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { HelpTooltip, StyledErrorText, StyledFieldLabel, StyledFieldWrapper, StyledRequiredIndicator } from '../components';

export const FieldTemplate: React.FC<FieldTemplateProps> = (props) => {
  const {
    id,
    children,
    errors,
    help,
    schema,
    hidden,
    required,
    displayLabel,
    label,
  } = props;
  const { t } = useTranslation('agent');

  if (hidden) {
    return <div style={{ display: 'none' }}>{children}</div>;
  }

  const description = schema.description;

  // Translate the label if it exists
  const translatedLabel = label ? t(label, label) : undefined;

  return (
    <StyledFieldWrapper>
      {displayLabel && translatedLabel && (
        <Box component='label' htmlFor={id} sx={{ display: 'block', mb: 0.5 }}>
          <StyledFieldLabel component='span'>
            {translatedLabel}
            {required && <StyledRequiredIndicator>*</StyledRequiredIndicator>}
            {typeof description === 'string' && description && <HelpTooltip description={t(description, description)} />}
          </StyledFieldLabel>
        </Box>
      )}
      {children}
      {errors && <StyledErrorText>{errors}</StyledErrorText>}
      {help}
    </StyledFieldWrapper>
  );
};
