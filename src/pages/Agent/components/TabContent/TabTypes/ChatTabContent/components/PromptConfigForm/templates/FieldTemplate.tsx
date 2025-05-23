import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { alpha, Box, Chip, Tooltip, Typography } from '@mui/material';
import { FieldTemplateProps, getUiOptions } from '@rjsf/utils';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Custom field template providing enhanced styling and layout for each field in the RJSF form
 * with improved visual cues and help functionality
 */
export const CustomFieldTemplate = ({
  id,
  label,
  help,
  required,
  description,
  errors,
  children,
  schema,
  hidden,
  uiSchema,
  displayLabel,
}: FieldTemplateProps): React.ReactElement => {
  const { t } = useTranslation('agent');
  const uiOptions = getUiOptions(uiSchema);

  if (hidden) {
    return <>{children}</>;
  }

  // Determine if label should be shown
  const showLabel = displayLabel !== false && label && schema.type !== 'object';

  // Help text combines help prop and description
  const helpText = help || description;

  // Check for field specific styling
  const isPrimary = uiOptions.variant === 'primary' || schema.format === 'primary';
  const isHighlighted = uiOptions.highlight === true || schema.format === 'highlight';

  // Check for special field types to apply specific styling
  const isReadOnly = schema.readOnly === true || uiOptions.readOnly === true;

  // Check for field validation features
  const hasPattern = !!schema.pattern;
  const hasFormat = !!schema.format;
  const isAdvanced = uiOptions.advanced === true;

  // Get optional badge text for the field
  const badgeText = uiOptions.badge;

  return (
    <Box
      sx={{
        mb: 2,
        position: 'relative',
        '&:hover .field-help-icon': {
          opacity: 1,
        },
        ...(isHighlighted
          ? {
            p: 2,
            backgroundColor: alpha('#f5f5f5', 0.5),
            border: '1px solid',
            borderColor: alpha(isPrimary ? '#2196f3' : '#000000', 0.1),
            borderRadius: 1,
          }
          : {}),
      }}
    >
      {showLabel && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            mb: 0.5,
            flexWrap: 'wrap',
          }}
        >
          <Typography
            variant='body1'
            component='label'
            htmlFor={id}
            sx={{
              fontWeight: 500,
              color: isPrimary ? 'primary.main' : 'text.primary',
              mr: 0.5,
            }}
          >
            {label}
            {required && (
              <Typography component='span' color='error.main' sx={{ ml: 0.5 }}>
                *
              </Typography>
            )}
          </Typography>

          {/* Display badges/chips for special field properties */}
          <Box sx={{ display: 'flex', ml: 'auto', gap: 0.5 }}>
            {isReadOnly && (
              <Chip
                label={t('Common.ReadOnly', 'Read Only')}
                size='small'
                variant='outlined'
                color='default'
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
            )}

            {isAdvanced && (
              <Chip
                label={t('Common.Advanced', 'Advanced')}
                size='small'
                variant='outlined'
                color='secondary'
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
            )}

            {hasPattern && (
              <Tooltip title={t('Common.PatternValidation', 'This field has pattern validation')}>
                <Chip
                  label={t('Common.Pattern', 'Pattern')}
                  size='small'
                  variant='outlined'
                  color='info'
                  sx={{ height: 20, fontSize: '0.65rem' }}
                />
              </Tooltip>
            )}

            {badgeText && (
              <Chip
                label={badgeText}
                size='small'
                variant='outlined'
                color={isPrimary ? 'primary' : 'default'}
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
            )}
          </Box>

          {helpText && (
            <Tooltip
              title={
                <Typography variant='body2' style={{ whiteSpace: 'pre-line' }}>
                  {helpText}
                </Typography>
              }
              placement='top'
            >
              <HelpOutlineIcon
                className='field-help-icon'
                sx={{
                  fontSize: 16,
                  ml: 0.5,
                  color: isPrimary ? 'primary.main' : 'text.secondary',
                  opacity: 0.5,
                  transition: 'opacity 0.2s',
                  cursor: 'help',
                }}
              />
            </Tooltip>
          )}
        </Box>
      )}

      {/* Description text that appears below the label */}
      {description && !help && !showLabel && (
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{
            mt: -0.5,
            mb: 1,
            display: 'block',
            fontStyle: 'italic',
          }}
        >
          {description}
        </Typography>
      )}

      {/* The actual form control */}
      <Box
        sx={{
          ...(isPrimary && {
            '& .MuiOutlinedInput-root': {
              '& fieldset': {
                borderColor: alpha('#2196f3', 0.5),
              },
              '&:hover fieldset': {
                borderColor: '#2196f3',
              },
            },
          }),
        }}
      >
        {children}
      </Box>

      {/* Error messages */}
      {errors && (
        <Typography
          variant='caption'
          color='error'
          sx={{
            mt: 0.5,
            display: 'block',
            backgroundColor: alpha('#f44336', 0.05),
            p: 0.5,
            borderRadius: 0.5,
          }}
        >
          {errors}
        </Typography>
      )}

      {/* Format hint for specific field formats */}
      {hasFormat && ['date', 'date-time', 'email', 'uri', 'regex'].includes(schema.format) && !errors && (
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{ mt: 0.5, display: 'block' }}
        >
          {t(`Format.${schema.format}`, `Format: ${schema.format}`)}
        </Typography>
      )}
    </Box>
  );
};
