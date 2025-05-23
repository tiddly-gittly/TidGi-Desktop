import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  alpha,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Tooltip,
  Typography
} from '@mui/material';
import { ArrayFieldTemplateProps, getUiOptions } from '@rjsf/utils';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Custom array field template providing enhanced styling and layout for array fields
 * with visual indicators for drag-and-drop reordering
 */
export const CustomArrayFieldTemplate = ({
  title,
  items,
  canAdd,
  onAddClick,
  uiSchema,
  required,
  schema,
  idSchema
}: ArrayFieldTemplateProps): React.ReactElement => {
  const { t } = useTranslation('agent');
  const uiOptions = getUiOptions(uiSchema);
  const hasItems = items && items.length > 0;
  
  // Determine styling based on options
  const isPrimary = uiOptions.variant === 'primary' || schema.format === 'primary';
  const isCompact = uiOptions.compact === true || schema.format === 'compact';
  const isCard = uiOptions.card !== false && !isCompact;
  
  // Custom title based on item types from schema
  const itemTitle = uiOptions.itemTitle || 
    (schema.items && typeof schema.items === 'object' && 'title' in schema.items
      ? String(schema.items.title)
      : t('Schema.ArrayItem', 'Item'));

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 1 
      }}>
        {title && (
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography
              variant='subtitle1'
              component='h3'
              sx={{
                fontWeight: 'medium',
                display: 'flex',
                alignItems: 'center',
                color: isPrimary ? 'primary.main' : 'text.primary',
              }}
            >
              {title}
              {required && (
                <Typography component='span' color='error.main' sx={{ ml: 0.5 }}>
                  *
                </Typography>
              )}
            </Typography>
            
            {/* Show item count */}
            {hasItems && (
              <Chip 
                label={t('Common.ItemCount', '{{count}} items', { count: items.length })} 
                size='small'
                color={isPrimary ? 'primary' : 'default'}
                variant='outlined'
                sx={{ 
                  ml: 1,
                  fontSize: '0.7rem',
                  height: '20px',
                }}
              />
            )}
            
            {schema.description && (
              <Tooltip title={schema.description}>
                <InfoOutlinedIcon
                  sx={{
                    fontSize: 16,
                    ml: 1,
                    color: isPrimary ? 'primary.main' : 'text.secondary',
                    opacity: 0.7,
                    cursor: 'help',
                  }}
                />
              </Tooltip>
            )}
          </Box>
        )}
        
        {/* Add button at the top right for better UX */}
        {canAdd && (
          <Button
            startIcon={<AddIcon />}
            onClick={onAddClick}
            variant={isPrimary ? 'contained' : 'outlined'}
            size='small'
            color={isPrimary ? 'primary' : 'primary'}
          >
            {t('Common.Add', 'Add')}
          </Button>
        )}
      </Box>
      
      {/* Description text if present */}
      {schema.description && (
        <Typography
          variant='body2'
          color='text.secondary'
          sx={{ mb: 2, fontStyle: 'italic' }}
        >
          {schema.description}
        </Typography>
      )}

      {/* Container for array items */}
      {hasItems && (
        <Box 
          sx={{ 
            mb: 2,
            ...(isCard ? {} : {
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              p: 1,
              backgroundColor: alpha('#f5f5f5', 0.3),
            })
          }}
        >
          {items.map((item, index) => (
            <Paper
              key={item.key}
              elevation={isCard ? 1 : 0}
              sx={{
                mb: isCard ? 2 : 1,
                mt: isCard ? 0 : 1,
                p: isCard ? 2 : 1,
                position: 'relative',
                borderRadius: 1,
                border: isCard ? '1px solid' : 'none',
                borderColor: isPrimary ? alpha('#2196f3', 0.3) : 'divider',
                backgroundColor: isCard 
                  ? (isPrimary ? alpha('#2196f3', 0.03) : 'background.paper')
                  : 'transparent',
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: isPrimary ? 'primary.main' : alpha('#000', 0.23),
                  boxShadow: isCard ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                },
              }}
            >
              <Box sx={{ 
                display: 'flex',
                justifyContent: 'space-between',
                mb: isCard ? 1 : 0.5,
                alignItems: 'center',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <DragIndicatorIcon 
                    sx={{ 
                      mr: 1, 
                      color: 'text.secondary', 
                      opacity: 0.6,
                      cursor: 'grab',
                      '&:hover': {
                        opacity: 1,
                      }
                    }} 
                  />
                  <Typography 
                    variant='subtitle2'
                    color={isPrimary ? 'primary.main' : 'text.primary'}
                    fontWeight='medium'
                  >
                    {`${itemTitle} ${index + 1}`}
                  </Typography>
                </Box>
                
                <Box>
                  {/* Move up button - only show if not first item */}
                  {index > 0 && (
                    <IconButton
                      size='small'
                      onClick={() => {
                        // Handle move up logic here if needed
                        console.log('Move up:', index);
                      }}
                      title={t('Common.MoveUp', 'Move Up')}
                      aria-label={t('Common.MoveUp', 'Move Up')}
                      sx={{ ml: 0.5 }}
                    >
                      <Typography variant='caption'>↑</Typography>
                    </IconButton>
                  )}
                  
                  {/* Move down button - only show if not last item */}
                  {index < items.length - 1 && (
                    <IconButton
                      size='small'
                      onClick={() => {
                        // Handle move down logic here if needed
                        console.log('Move down:', index);
                      }}
                      title={t('Common.MoveDown', 'Move Down')}
                      aria-label={t('Common.MoveDown', 'Move Down')}
                      sx={{ ml: 0.5 }}
                    >
                      <Typography variant='caption'>↓</Typography>
                    </IconButton>
                  )}
                  
                  {/* Remove button - always show */}
                  <IconButton
                    size='small'
                    onClick={() => {
                      // Handle remove logic here if needed
                      console.log('Remove:', index);
                    }}
                    title={t('Common.Remove', 'Remove')}
                    aria-label={t('Common.Remove', 'Remove')}
                    color='error'
                    sx={{ ml: 0.5 }}
                  >
                    <DeleteIcon fontSize='small' />
                  </IconButton>
                </Box>
              </Box>
              
              {isCard && <Divider sx={{ mb: 2 }} />}
              {item.children}
            </Paper>
          ))}
        </Box>
      )}

      {/* Bottom add button for longer lists */}
      {canAdd && hasItems && items.length > 2 && (
        <Button
          startIcon={<AddIcon />}
          onClick={onAddClick}
          variant={isPrimary ? 'contained' : 'outlined'}
          size='small'
          color={isPrimary ? 'primary' : 'primary'}
        >
          {t('Common.AddAnother', 'Add Another')}
        </Button>
      )}
      
      {/* Empty state */}
      {!hasItems && (
        <Paper
          variant='outlined'
          sx={{
            p: 3,
            mb: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: alpha('#f5f5f5', 0.3),
            borderStyle: 'dashed',
          }}
        >
          <Typography color='text.secondary' sx={{ mb: 2, textAlign: 'center' }}>
            {t('Common.NoItemsYet', 'No items yet. Click "Add" to add your first item.')}
          </Typography>
          
          {canAdd && (
            <Button
              startIcon={<AddIcon />}
              onClick={onAddClick}
              variant={isPrimary ? 'contained' : 'outlined'}
              size='small'
              color={isPrimary ? 'primary' : 'primary'}
            >
              {t('Common.AddFirst', 'Add First Item')}
            </Button>
          )}
        </Paper>
      )}
    </Box>
  );
};
