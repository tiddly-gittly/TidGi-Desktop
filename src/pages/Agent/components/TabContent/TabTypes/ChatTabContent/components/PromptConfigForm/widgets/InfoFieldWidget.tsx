import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Box, Paper, Typography } from '@mui/material';
import { WidgetProps } from '@rjsf/utils';
import React from 'react';

/**
 * InfoField widget for displaying information in a card format
 * Features:
 * - Card-based layout
 * - Icon support
 * - Rich text formatting
 * - Optional descriptions
 */
export const InfoFieldWidget = (props: WidgetProps): React.ReactElement => {
  const schema = props.schema;
  const label = props.label;
  const value: unknown = props.value;
  const description = schema.description || '';

  // Default info text is either the value or schema description
  const infoText = typeof value === 'string' && value.length > 0
    ? value
    : description;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        backgroundColor: 'info.main',
        color: 'info.contrastText',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
      }}
    >
      <InfoOutlinedIcon
        sx={{
          mt: 0.25,
          color: 'info.contrastText',
          opacity: 0.9,
        }}
      />
      <Box sx={{ flex: 1 }}>
        {label && (
          <Typography
            variant='subtitle1'
            component='div'
            sx={{
              mb: 0.5,
              fontWeight: 500,
              color: 'inherit',
            }}
          >
            {label}
          </Typography>
        )}
        <Typography
          variant='body2'
          sx={{
            color: 'inherit',
            opacity: 0.9,
            whiteSpace: 'pre-line',
          }}
        >
          {infoText}
        </Typography>
      </Box>
    </Paper>
  );
};
