import { Alert, AlertTitle, Collapse, Typography } from '@mui/material';
import { RJSFValidationError } from '@rjsf/utils';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface ErrorDisplayProps {
  errors: RJSFValidationError[];
}

/**
 * Display validation errors in a collapsible alert
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ errors }) => {
  const { t } = useTranslation('agent');

  if (errors.length === 0) {
    return null;
  }

  return (
    <Collapse in={true}>
      <Alert severity='error' sx={{ mt: 2 }}>
        <AlertTitle>{t('Prompt.ValidationErrors')}</AlertTitle>
        {errors.map((error, index) => (
          <Typography key={index} variant='body2' component='div'>
            {error.property ? `${error.property}: ` : ''}
            {error.message}
          </Typography>
        ))}
      </Alert>
    </Collapse>
  );
};
