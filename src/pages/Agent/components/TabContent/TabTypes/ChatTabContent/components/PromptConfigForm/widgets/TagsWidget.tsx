import { Autocomplete, TextField } from '@mui/material';
import { WidgetProps } from '@rjsf/utils';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Custom widget for tags input using MUI Autocomplete with Chips
 * Supports both selecting from predefined options and creating new tags
 */
export const TagsWidget: React.FC<WidgetProps> = ({
  id,
  value = [],
  onChange,
  onBlur,
  onFocus,
  disabled,
  readonly,
  required,
  label,
  placeholder,
  _schema,
  _uiSchema,
}) => {
  const { t } = useTranslation('agent');

  // Predefined tags that users can select from
  const predefinedTags = useMemo(() => [
    'SystemPrompt',
    'UserPrompt',
    'AssistantPrompt',
    'Context',
    'Instruction',
    'Example',
    'Template',
    'Dynamic',
    'Static',
    'Important',
    'Optional',
    'Debug',
  ], []);

  // Combine predefined tags with current value to create options
  const allOptions = useMemo(() => {
    const valueArray = Array.isArray(value) ? (value as string[]) : [];
    const combined = [...new Set([...predefinedTags, ...valueArray])];
    return combined.filter((tag): tag is string => Boolean(tag));
  }, [predefinedTags, value]);

  const handleChange = useCallback((_event: React.SyntheticEvent, newValue: string[]) => {
    onChange(newValue);
  }, [onChange]);

  const handleBlur = useCallback(() => {
    onBlur(id, Array.isArray(value) ? value : []);
  }, [onBlur, id, value]);

  const handleFocus = useCallback(() => {
    onFocus(id, Array.isArray(value) ? value : []);
  }, [onFocus, id, value]);

  const valueArray = Array.isArray(value) ? value : [];

  return (
    <Autocomplete
      multiple
      id={id}
      options={allOptions}
      value={valueArray}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      disabled={disabled || readonly}
      freeSolo // Allow creating new tags
      slotProps={{
        chip: {
          size: 'small',
          variant: 'outlined',
          color: 'primary',
        },
      }}
      renderInput={(parameters) => (
        <TextField
          {...parameters}
          label={label || String(t('Schema.Prompt.Tags'))}
          placeholder={placeholder || String(t('PromptConfig.Tags.Placeholder'))}
          required={required}
          size='small'
          helperText={String(t('PromptConfig.Tags.HelperText'))}
        />
      )}
      sx={{
        '& .MuiAutocomplete-tag': {
          margin: '2px',
        },
      }}
      getOptionLabel={(option) => String(option)}
      isOptionEqualToValue={(option, valueItem) => String(option) === String(valueItem)}
      noOptionsText={String(t('PromptConfig.Tags.NoOptions'))}
      clearOnBlur
      selectOnFocus
      handleHomeEndKeys
    />
  );
};
