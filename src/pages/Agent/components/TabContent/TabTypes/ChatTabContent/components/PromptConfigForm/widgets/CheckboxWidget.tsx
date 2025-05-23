import { Box, Checkbox, FormControlLabel, Typography } from '@mui/material';
import { WidgetProps } from '@rjsf/utils';
import React from 'react';

/**
 * Enhanced checkbox widget with improved styling
 * Features:
 * - Visual feedback for checked state
 * - Support for descriptions
 * - Custom label styling
 * - Required field indication
 */
export const CheckboxWidget = (props: WidgetProps): React.ReactElement => {
  const id = props.id;
  const value: unknown = props.value;
  const _required = props.required;
  const disabled = props.disabled;
  const readonly = props.readonly;
  const onChange = props.onChange;
  const onBlur = props.onBlur;
  const onFocus = props.onFocus;
  const label = props.label;
  const schema = props.schema;

  // Safely handle boolean value
  const checkboxValue = typeof value === 'boolean' ? value : false;

  const _onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked);
  };

  const _onBlur = (event: React.FocusEvent<HTMLButtonElement>) => {
    onBlur(id, (event.target as HTMLInputElement).checked);
  };

  const _onFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    onFocus(id, (event.target as HTMLInputElement).checked);
  };

  return (
    <Box sx={{ mb: 1 }}>
      <FormControlLabel
        control={
          <Checkbox
            id={id}
            checked={checkboxValue}
            required={_required}
            disabled={disabled || readonly}
            onChange={_onChange}
            onBlur={_onBlur}
            onFocus={_onFocus}
            sx={{
              '&.Mui-checked': {
                color: 'primary.main',
              },
            }}
          />
        }
        label={
          <Typography
            variant='body1'
            component='span'
            sx={{
              fontWeight: checkboxValue ? 500 : 400,
              color: checkboxValue ? 'text.primary' : 'text.secondary',
            }}
          >
            {label}
            {_required && (
              <Typography component='span' color='error.main' sx={{ ml: 0.5 }}>
                *
              </Typography>
            )}
          </Typography>
        }
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          '& .MuiFormControlLabel-label': {
            mt: 0.7,
          },
        }}
      />
      {schema.description && (
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{
            mt: 0.5,
            display: 'block',
            ml: 4,
            fontStyle: 'italic',
            whiteSpace: 'pre-line',
          }}
        >
          {schema.description}
        </Typography>
      )}
    </Box>
  );
};
