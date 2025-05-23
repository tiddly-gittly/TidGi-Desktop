import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import { WidgetProps } from '@rjsf/utils';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Enhanced select widget with search and autocomplete capabilities
 * Features:
 * - Search and filter options
 * - Customizable option rendering
 * - Support for disabled options
 * - Clear button when not required
 */
export const SelectWidget = (props: WidgetProps): React.ReactElement => {
  const { t } = useTranslation('agent');

  // Type-safe props extraction
  const id = props.id;
  const options = props.options;
  const value: unknown = props.value;
  const _required = props.required;
  const disabled = props.disabled;
  const readonly = props.readonly;
  const onChange = props.onChange;
  const onBlur = props.onBlur;
  const onFocus = props.onFocus;
  const placeholder = props.placeholder;
  const autofocus = props.autofocus;
  const schema = props.schema;

  const { enumOptions, enumDisabled } = options;

  if (!enumOptions) {
    return <Box sx={{ color: 'text.secondary', fontStyle: 'italic' }}>{t('Common.NoOptionsAvailable', 'No options available')}</Box>;
  }

  const _onChange = (_: React.SyntheticEvent, newValue: { value: unknown; label: string } | null) => {
    onChange(newValue?.value === '' ? options.emptyValue : newValue?.value);
  };

  const _onBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    onBlur(id, event.target.value);
  };

  const _onFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    onFocus(id, event.target.value);
  };

  const selectOptions = enumOptions.map((option: { value: unknown; label: string }) => ({
    value: option.value,
    label: option.label,
    disabled: enumDisabled && Array.isArray(enumDisabled) &&
      enumDisabled.some((item: string | number | boolean) => String(item) === String(option.value)),
  }));

  const selectedOption = selectOptions.find((option) => option.value === value) || null;

  return (
    <Box sx={{ width: '100%' }}>
      <Autocomplete
        id={id}
        options={selectOptions}
        getOptionLabel={(option) => (typeof option === 'object' ? option.label : String(option))}
        value={selectedOption}
        onChange={_onChange}
        disabled={disabled || readonly}
        disableClearable={_required}
        fullWidth
        renderInput={(parameters) => (
          <TextField
            {...parameters}
            placeholder={placeholder}
            required={_required}
            autoFocus={autofocus}
            onBlur={_onBlur}
            onFocus={_onFocus}
            variant='outlined'
            slotProps={{
              input: {
                ...parameters.InputProps,
              },
            }}
          />
        )}
        renderOption={(props, option) => (
          <Box
            component='li'
            {...props}
            sx={{
              opacity: option.disabled ? 0.5 : 1,
              '&.Mui-disabled': {
                pointerEvents: 'none',
              },
            }}
          >
            {option.label}
          </Box>
        )}
        sx={{
          '& .MuiAutocomplete-tag': {
            backgroundColor: 'primary.light',
            color: 'primary.contrastText',
            fontWeight: 'medium',
          },
        }}
      />
      {schema.description && (
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{ mt: 0.5, display: 'block', fontStyle: 'italic' }}
        >
          {schema.description}
        </Typography>
      )}
    </Box>
  );
};
