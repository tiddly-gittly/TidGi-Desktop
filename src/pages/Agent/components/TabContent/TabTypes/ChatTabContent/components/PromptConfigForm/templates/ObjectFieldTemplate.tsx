import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SearchIcon from '@mui/icons-material/Search';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  alpha,
  Badge,
  Box,
  Chip,
  Divider,
  InputAdornment,
  Paper,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { getTemplate, getUiOptions, ObjectFieldTemplateProps } from '@rjsf/utils';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Custom object field template that transforms complex objects into collapsible panels
 * with enhanced visual hierarchy and interactive elements
 * Features:
 * - Collapsible sections for better organization
 * - Visual indicators for different section types
 * - Search functionality for finding fields in complex forms
 * - Status badges showing field counts
 */
export const CustomObjectFieldTemplate = ({
  description,
  title,
  properties,
  required,
  uiSchema,
  idSchema,
  schema,
  registry,
}: ObjectFieldTemplateProps): React.ReactElement => {
  const { t } = useTranslation('agent');
  const uiOptions = getUiOptions(uiSchema);
  const _TitleTemplate = getTemplate('TitleFieldTemplate', registry, uiOptions);
  const DescriptionTemplate = getTemplate('DescriptionFieldTemplate', registry, uiOptions);
  
  // Track expanded state
  const [expanded, setExpanded] = useState(uiOptions.expandable !== false);
  // Search term state
  const [searchTerm, setSearchTerm] = useState('');
  
  // Determine panel style based on schema properties or UI options
  const isPrimary = uiOptions.variant === 'primary' || schema.format === 'primary';
  const isInfo = uiOptions.variant === 'info' || schema.format === 'info';
  const isWarning = uiOptions.variant === 'warning' || schema.format === 'warning';
  const isSuccess = uiOptions.variant === 'success' || schema.format === 'success';
  
  // Handle search input change
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };
  
  // Filter properties based on search term
  const filteredProperties = searchTerm
    ? properties.filter(prop => {
        const propName = prop.name ? String(prop.name).toLowerCase() : '';
        // Safely check for schema property
        const propContent = prop.content as any;
        const propTitle = propContent?.props?.schema?.title 
          ? String(propContent.props.schema.title).toLowerCase() 
          : '';
        return propName.includes(searchTerm.toLowerCase()) || 
               propTitle.includes(searchTerm.toLowerCase());
      })
    : properties;
  
  // Root level object doesn't use accordion
  if (idSchema.$id === 'root') {
    return (
      <Box>
        {properties.length > 5 && (
          <Box sx={{ mb: 2 }}>
            <TextField
              placeholder={t('Form.SearchFields', 'Search fields...')}
              variant="outlined"
              size="small"
              fullWidth
              value={searchTerm}
              onChange={handleSearchChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Box>
        )}
        {filteredProperties.map((property) => property.content)}
      </Box>
    );
  }

  // Custom sections for specific object formats
  if (isInfo) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          backgroundColor: alpha('#2196f3', 0.05),
          border: '1px solid',
          borderColor: alpha('#2196f3', 0.2),
          borderRadius: 1,
        }}
      >
        {title && (
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <InfoOutlinedIcon sx={{ mr: 1, color: 'info.main' }} fontSize='small' />
            <Typography variant='subtitle1' color='info.main' fontWeight='medium'>
              {title}
              {required && (
                <Typography component='span' color='error.main' sx={{ ml: 0.5 }}>
                  *
                </Typography>
              )}
            </Typography>
          </Box>
        )}

        {description && (
          <Box sx={{ mb: 2 }}>
            <DescriptionTemplate
              id={`${idSchema.$id}-description`}
              description={description}
              schema={schema}
              uiSchema={uiSchema}
              registry={registry}
            />
          </Box>
        )}

        <Box>
          {properties.map((property) => (
            <Box key={property.name} sx={{ mb: 2 }}>
              {property.content}
            </Box>
          ))}
        </Box>
      </Paper>
    );
  }

  // Default behavior - use accordion
  return (
    <Accordion 
      expanded={expanded} 
      onChange={() => setExpanded(!expanded)} 
      sx={{ 
        mb: 2,
        border: '1px solid',
        borderColor: isPrimary 
          ? 'primary.light' 
          : isWarning 
            ? 'warning.light' 
            : 'divider',
        borderRadius: '4px !important',
        '&::before': {
          display: 'none',
        },
        backgroundColor: isPrimary 
          ? alpha('#2196f3', 0.03)
          : isWarning
            ? alpha('#ff9800', 0.03)
            : 'background.paper',
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          borderBottom: expanded ? '1px solid' : 'none',
          borderBottomColor: 'divider',
          backgroundColor: isPrimary 
            ? alpha('#2196f3', 0.05)
            : isWarning
              ? alpha('#ff9800', 0.05)
              : 'background.default',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          {title && (
            <Typography 
              variant='subtitle1' 
              fontWeight='medium'
              color={isPrimary ? 'primary.main' : isWarning ? 'warning.dark' : 'text.primary'}
              sx={{ flex: 1 }}
            >
              {title}
              {required && (
                <Typography component='span' color='error.main' sx={{ ml: 0.5 }}>
                  *
                </Typography>
              )}
            </Typography>
          )}
          
          {/* Display property count chip */}
          <Chip 
            label={t('Common.ItemCount', '{{count}} items', { count: properties.length })} 
            size='small'
            color={isPrimary ? 'primary' : isWarning ? 'warning' : 'default'}
            variant='outlined'
            sx={{ 
              ml: 1,
              fontSize: '0.7rem',
              height: '20px',
            }}
          />
          
          {description && (
            <Tooltip title={description} placement='top'>
              <HelpOutlineIcon
                sx={{
                  fontSize: 16,
                  ml: 1,
                  color: isPrimary ? 'primary.main' : isWarning ? 'warning.main' : 'text.secondary',
                  opacity: 0.7,
                  cursor: 'help',
                }}
              />
            </Tooltip>
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 2 }}>
        {description && (
          <Box sx={{ mb: 2 }}>
            <Typography 
              variant='body2' 
              sx={{ 
                color: 'text.secondary',
                backgroundColor: alpha('#f5f5f5', 0.5),
                p: 1,
                borderRadius: 1,
                fontStyle: 'italic'
              }}
            >
              {description}
            </Typography>
          </Box>
        )}

        <Box>
          {properties.map((property, index) => (
            <React.Fragment key={property.name}>
              {property.content}
              {index < properties.length - 1 && <Divider sx={{ my: 2 }} />}
            </React.Fragment>
          ))}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};
