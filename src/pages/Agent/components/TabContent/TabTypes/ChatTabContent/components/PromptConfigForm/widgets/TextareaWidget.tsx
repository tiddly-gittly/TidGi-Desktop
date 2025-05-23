import CodeIcon from '@mui/icons-material/Code';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import { alpha, Box, Chip, IconButton, InputAdornment, Snackbar, TextareaAutosize, TextField, Tooltip, Typography } from '@mui/material';
import { WidgetProps } from '@rjsf/utils';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Enhanced textarea widget for longer text content with code editing capabilities
 * Features:
 * - Auto detection of code content
 * - Code formatting support
 * - Expandable view
 * - Monospace font for code
 * - Copy to clipboard functionality
 * - Code indentation helper
 */
export const TextareaWidget = (props: WidgetProps): React.ReactElement => {
  const { t } = useTranslation('agent');
  const id = props.id;
  const placeholder = props.placeholder;
  const _required = props.required;
  const disabled = props.disabled;
  const autofocus = props.autofocus;
  const onChange = props.onChange;
  const onBlur = props.onBlur;
  const onFocus = props.onFocus;
  const options = props.options;
  const readonly = props.readonly;
  const value: unknown = props.value;
  const schema = props.schema;
  // Rename to _label to avoid linting error since we're not using it
  const _label = props.label;

  // State for expanded view and snackbar
  const [expanded, setExpanded] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Safely get value and ensure type safety
  const stringValue = typeof value === 'string' ? value : '';

  // Check if the content might be code
  const mightBeCode = stringValue.includes('{') || stringValue.includes('<') ||
    stringValue.includes('function') || stringValue.includes('(') ||
    schema.format === 'code';

  // Auto-expand when detected as code
  useEffect(() => {
    if (mightBeCode && stringValue.length > 100 && !expanded) {
      setExpanded(true);
    }
  }, [mightBeCode, stringValue, expanded]);

  const _onChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = event.target.value;
    onChange(newValue === '' ? options.emptyValue : newValue);
  };

  const _onBlur = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    onBlur(id, event.target.value);
  };

  const _onFocus = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    onFocus(id, event.target.value);
  };

  // Handle expanded view toggle
  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  // Copy to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(stringValue)
      .then(() => {
        setSnackbarMessage(t('Editor.CopiedToClipboard', 'Copied to clipboard'));
        setSnackbarOpen(true);
      })
      .catch((error) => {
        console.error('Failed to copy text:', error);
        setSnackbarMessage(t('Editor.FailedToCopy', 'Failed to copy'));
        setSnackbarOpen(true);
      });
  };

  // Format/indent code
  const formatCode = () => {
    try {
      let formatted = stringValue;
      
      // Try to detect and format JSON
      if (stringValue.trim().startsWith('{') || stringValue.trim().startsWith('[')) {
        try {
          const jsonObject = JSON.parse(stringValue);
          formatted = JSON.stringify(jsonObject, null, 2);
          onChange(formatted);
          setSnackbarMessage(t('Editor.CodeFormatted', 'Code formatted'));
          setSnackbarOpen(true);
          return;
        } catch (error) {
          // Not valid JSON, continue with other formatting options
        }
      }

      // Simple indentation improvement for other code types
      const lines = stringValue.split('\n');
      let indentLevel = 0;
      const formattedLines = lines.map(line => {
        const trimmedLine = line.trim();
        
        // Adjust indent level based on braces
        if (trimmedLine.includes('}') || trimmedLine.includes('>')) {
          indentLevel = Math.max(0, indentLevel - 1);
        }
        
        const indentedLine = '  '.repeat(indentLevel) + trimmedLine;
        
        if (trimmedLine.includes('{') || trimmedLine.includes('<') && !trimmedLine.includes('/>')) {
          indentLevel += 1;
        }
        
        return indentedLine;
      });
      
      formatted = formattedLines.join('\n');
      onChange(formatted);
      setSnackbarMessage(t('Editor.CodeFormatted', 'Code formatted'));
      setSnackbarOpen(true);
    } catch (error) {
      console.error('Failed to format code:', error);
      setSnackbarMessage(t('Editor.FormatFailed', 'Format failed'));
      setSnackbarOpen(true);
    }
  };

  // Handle snackbar close
  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  // Create end adornment with code or expand button
  const endAdornment = (
    <>
      {stringValue.length > 0 && (
        <InputAdornment position='end'>
          <Tooltip title={t('Editor.CopyToClipboard', 'Copy to clipboard')}>
            <IconButton
              edge='end'
              size='small'
              onClick={copyToClipboard}
            >
              <ContentCopyIcon fontSize='small' color='action' />
            </IconButton>
          </Tooltip>
        </InputAdornment>
      )}
      {mightBeCode && (
        <InputAdornment position='end'>
          <Tooltip title={t('Editor.FormatCode', 'Format code')}>
            <IconButton
              edge='end'
              size='small'
              onClick={formatCode}
            >
              <FormatIndentIncreaseIcon fontSize='small' color='action' />
            </IconButton>
          </Tooltip>
        </InputAdornment>
      )}
      <InputAdornment position='end'>
        <Tooltip title={expanded ? t('Editor.CollapseEditor', 'Collapse editor') : t('Editor.ExpandEditor', 'Expand editor')}>
          <IconButton
            edge='end'
            size='small'
            onClick={toggleExpanded}
          >
            {mightBeCode ? (
              <CodeIcon fontSize='small' color='action' />
            ) : (
              <EditIcon fontSize='small' color='action' />
            )}
          </IconButton>
        </Tooltip>
      </InputAdornment>
    </>
  );

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      <TextField
        id={id}
        fullWidth
        multiline
        placeholder={placeholder}
        disabled={disabled || readonly}
        required={_required}
        autoFocus={autofocus}
        value={stringValue}
        onChange={_onChange}
        onBlur={_onBlur}
        onFocus={_onFocus}
        slotProps={{
          input: {
            component: TextareaAutosize,
            minRows: expanded ? 15 : 3,
            maxRows: expanded ? 30 : 10,
            style: {
              resize: 'vertical',
              fontFamily: mightBeCode ? '"Roboto Mono", monospace' : 'inherit',
              whiteSpace: 'pre-wrap',
            },
            endAdornment,
          },
        }}
        sx={{
          '.MuiInputBase-root': {
            backgroundColor: mightBeCode ? alpha('#f5f5f5', 0.7) : 'transparent',
            fontFamily: mightBeCode ? '"Roboto Mono", monospace' : 'inherit',
          },
        }}
      />
      {mightBeCode && (
        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-start', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
          <Chip
            size="small"
            variant="outlined"
            color="primary"
            label={t('Editor.CodeDetected', 'Code detected')}
            icon={<CodeIcon fontSize="small" />}
          />
          {stringValue.includes('{') && stringValue.includes('}') && (
            <Chip
              size="small"
              variant="outlined"
              color="secondary"
              label="JSON"
            />
          )}
        </Box>
      )}
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
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
};
