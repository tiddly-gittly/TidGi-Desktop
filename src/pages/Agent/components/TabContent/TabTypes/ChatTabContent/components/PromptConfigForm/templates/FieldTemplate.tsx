import { Box } from '@mui/material';
import { FieldTemplateProps } from '@rjsf/utils';
import React from 'react';
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

  if (hidden) {
    return <div style={{ display: 'none' }}>{children}</div>;
  }

  const description = schema.description;

  return (
    <StyledFieldWrapper>
      {displayLabel && label && (
        <Box component='label' htmlFor={id} sx={{ display: 'block', mb: 0.5 }}>
          <StyledFieldLabel>
            {label}
            {required && <StyledRequiredIndicator>*</StyledRequiredIndicator>}
            {typeof description === 'string' && description && <HelpTooltip description={description} />}
          </StyledFieldLabel>
        </Box>
      )}
      {children}
      {errors && <StyledErrorText>{errors}</StyledErrorText>}
      {help}
    </StyledFieldWrapper>
  );
};
