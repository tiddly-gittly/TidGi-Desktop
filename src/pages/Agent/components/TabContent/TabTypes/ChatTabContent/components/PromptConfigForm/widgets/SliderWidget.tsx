import { Box, Slider, Typography } from '@mui/material';
import { WidgetProps } from '@rjsf/utils';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface Mark {
  value: number;
  label: string | number;
}

/**
 * Slider widget for numeric ranges with immediate feedback
 * Features:
 * - Min/max value display
 * - Current value indicator
 * - Custom step size support
 * - Optional marks
 */
export const SliderWidget = (props: WidgetProps): React.ReactElement => {
  const { t } = useTranslation('agent');
  const id = props.id;
  const value: unknown = props.value;
  const schema = props.schema;
  const _required = props.required;
  const disabled = props.disabled;
  const readonly = props.readonly;
  const onChange = props.onChange;
  const onBlur = props.onBlur;
  const onFocus = props.onFocus;
  const options = props.options;

  // Get slider settings from schema
  const minimum = schema.minimum || 0;
  const maximum = schema.maximum || 100;
  const step = schema.multipleOf || 1;

  // Safe type handling
  const numberValue = typeof value === 'number' ? value : minimum;

  const _onChange = (_: Event, newValue: number | number[]) => {
    onChange(newValue);
  };

  const _onBlur = () => {
    onBlur(id, numberValue);
  };

  const _onFocus = () => {
    onFocus(id, numberValue);
  };

  // Type-safe marks handling
  const getMarks = (): Mark[] | false => {
    if (Array.isArray(options.marks)) {
      return options.marks.map((mark: { value: number; label: string | number }) => ({
        value: mark.value,
        label: mark.label,
      }));
    }

    if (options.marks === true) {
      return Array.from({ length: Math.floor((maximum - minimum) / step) + 1 }).map((_, index) => ({
        value: minimum + index * step,
        label: minimum + index * step,
      }));
    }

    return false;
  };

  const marks = getMarks();

  return (
    <Box sx={{ width: '100%', px: 1, mt: 2, mb: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant='body2' color='text.secondary'>
          {minimum}
        </Typography>
        <Typography variant='body2' fontWeight='medium'>
          {t('Common.CurrentValue', 'Current: {{value}}', { value: numberValue })}
        </Typography>
        <Typography variant='body2' color='text.secondary'>
          {maximum}
        </Typography>
      </Box>
      <Slider
        id={id}
        value={numberValue}
        min={minimum}
        max={maximum}
        step={step}
        onChange={_onChange}
        onBlur={_onBlur}
        onFocus={_onFocus}
        disabled={disabled || readonly}
        valueLabelDisplay='auto'
        marks={marks}
        sx={{
          color: 'primary.main',
          height: 8,
          '& .MuiSlider-thumb': {
            width: 24,
            height: 24,
            '&:hover, &.Mui-focusVisible': {
              boxShadow: '0 0 0 8px rgba(33, 150, 243, 0.16)',
            },
          },
          '& .MuiSlider-mark': {
            backgroundColor: '#bfbfbf',
            height: 8,
            width: 1,
            '&.MuiSlider-markActive': {
              opacity: 1,
              backgroundColor: 'currentColor',
            },
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
            fontStyle: 'italic',
          }}
        >
          {schema.description}
        </Typography>
      )}
    </Box>
  );
};
