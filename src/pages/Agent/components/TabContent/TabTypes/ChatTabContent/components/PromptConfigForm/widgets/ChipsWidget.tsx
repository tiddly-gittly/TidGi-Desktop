import { Autocomplete, Box, Chip, Paper, TextField, Typography } from '@mui/material';
import { WidgetProps } from '@rjsf/utils';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface ChipOption {
  value: unknown;
  label: string;
  disabled?: boolean;
}

/**
 * Multi-select chip input for array type data
 * Features:
 * - Tag-based interface
 * - Support for disabled options
 * - Custom chip styling
 * - Clear all functionality
 */
export const ChipsWidget = (props: WidgetProps): React.ReactElement => {
  const { t } = useTranslation('agent');
  const id = props.id;
  const value: unknown = props.value;
  const schema = props.schema;
  const _required = props.required;
  const disabled = props.disabled;
  const readonly = props.readonly;
  const onChange = props.onChange;
  const options = props.options;
  const placeholder = props.placeholder || t('Common.SelectItems', 'Select items...');

  // Ensure value is an array
  const arrayValue = Array.isArray(value) ? value : [];
  const { enumOptions, enumDisabled } = options;

  if (!enumOptions) {
    return <Box sx={{ color: 'text.secondary', fontStyle: 'italic' }}>{t('Common.NoOptionsAvailable', 'No options available')}</Box>;
  }

  const selectOptions: ChipOption[] = enumOptions.map((option: { value: unknown; label: string }) => ({
    value: option.value,
    label: option.label,
    disabled: enumDisabled && Array.isArray(enumDisabled) &&
      enumDisabled.some((item) => String(item) === String(option.value)),
  }));

  const _onChange = (_: React.SyntheticEvent, selectedOptions: ChipOption[]) => {
    const selectedValues = selectedOptions.map((option) => option.value);
    onChange(selectedValues.length ? selectedValues : options.emptyValue);
  };

  // Find selected options
  const selectedOptions = selectOptions.filter((option) => arrayValue.some((v: unknown) => String(v) === String(option.value)));

  return (
    <Box sx={{ width: '100%' }}>
      <Paper elevation={0} sx={{ p: 1, backgroundColor: 'background.default' }}>
        <Autocomplete
          id={id}
          multiple
          options={selectOptions}
          value={selectedOptions}
          onChange={_onChange}
          getOptionLabel={(option) => (typeof option === 'object' ? option.label : String(option))}
          disabled={disabled || readonly}
          disableCloseOnSelect
          renderInput={(parameters) => (
            <TextField
              {...parameters}
              variant='standard'
              placeholder={selectedOptions.length ? '' : placeholder}
              slotProps={{
                input: {
                  ...parameters.InputProps,
                  disableUnderline: true,
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
          renderTags={(selectedOptions, getTagProps) =>
            selectedOptions.map((option, index) => (
              <Chip
                {...getTagProps({ index })}
                key={index}
                label={option.label}
                color='primary'
                variant='outlined'
                size='small'
                sx={{ m: 0.5 }}
              />
            ))}
        />
      </Paper>
      {schema.description && (
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{
            mt: 0.5,
            display: 'block',
            fontStyle: 'italic',
          }}
        >
          {schema.description}
        </Typography>
      )}
    </Box>
  );
};
