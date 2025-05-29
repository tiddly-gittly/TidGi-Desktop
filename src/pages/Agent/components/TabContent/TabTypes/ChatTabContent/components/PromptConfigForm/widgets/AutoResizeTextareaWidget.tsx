import { TextField } from '@mui/material';
import { WidgetProps } from '@rjsf/utils';
import React, { useCallback } from 'react';

/**
 * Textarea widget that shows 1 row when empty, configured rows when has content
 * Allows manual resizing by dragging
 */
export const AutoResizeTextareaWidget: React.FC<WidgetProps> = ({
  id,
  value = '',
  onChange,
  onBlur,
  onFocus,
  disabled,
  readonly,
  required,
  label,
  placeholder,
  uiSchema,
}) => {
  const handleChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  }, [onChange]);

  const handleBlur = useCallback((event: React.FocusEvent<HTMLTextAreaElement>) => {
    onBlur(id, event.target.value);
  }, [onBlur, id]);

  const handleFocus = useCallback((event: React.FocusEvent<HTMLTextAreaElement>) => {
    onFocus(id, event.target.value);
  }, [onFocus, id]);

  // Get configured rows from uiSchema, default to 4 for content
  const uiOptions = uiSchema?.['ui:options'] as Record<string, unknown> | undefined;
  const configuredRows = typeof uiOptions?.rows === 'number' ? uiOptions.rows : 4;

  // Use 1 row when empty, configured rows when has content
  const isEmpty = !value || String(value).trim() === '';
  const minRows = isEmpty ? 1 : configuredRows;

  return (
    <TextField
      id={id}
      value={value as string || ''}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      disabled={disabled}
      slotProps={{
        htmlInput: {
          readOnly: readonly,
        },
      }}
      required={required}
      label={label}
      placeholder={placeholder}
      multiline
      minRows={minRows}
      size='small'
      fullWidth
      sx={{
        '& .MuiInputBase-input': {
          resize: 'vertical', // 允许垂直方向手动调整大小
        },
      }}
    />
  );
};
