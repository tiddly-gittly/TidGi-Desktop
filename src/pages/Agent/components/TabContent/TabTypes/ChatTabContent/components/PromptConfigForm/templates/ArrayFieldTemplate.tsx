import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { alpha, Box, Button, Divider, Paper, Typography } from '@mui/material';
import { ArrayFieldTemplateProps, getUiOptions } from '@rjsf/utils';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { SectionTitle, StyledIconButton, StyledPaper } from '../components/SharedComponents';

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
  idSchema: _idSchema,
}: ArrayFieldTemplateProps): React.ReactElement => {
  const { t } = useTranslation('agent');
  const uiOptions = getUiOptions(uiSchema);
  const hasItems = Boolean(items.length);

  // Determine styling based on options
  const isPrimary = uiOptions.variant === 'primary' || schema.format === 'primary';
  const isCompact = uiOptions.compact === true || schema.format === 'compact';
  const isCard = uiOptions.card !== false && !isCompact;

  // Custom title based on item types from schema - type-safe approach
  const itemTitle = uiOptions.itemTitle ||
    (schema.items && typeof schema.items === 'object' && 'title' in schema.items
      ? String((schema.items as { title?: string }).title) || t('Schema.ArrayItem', 'Item')
      : t('Schema.ArrayItem', 'Item'));

  return (
    <Box sx={{ mb: 3 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        {title && (
          <SectionTitle
            title={title}
            required={required}
            description={schema.description}
            itemCount={hasItems ? items.length : undefined}
            level={2}
          />
        )}

        {/* Add button at the top right for better UX */}
        {canAdd && (
          <Button
            startIcon={<AddIcon />}
            onClick={onAddClick}
            variant={isPrimary ? 'contained' : 'outlined'}
            size="small"
            color="primary"
          >
            {t('Common.Add', 'Add')}
          </Button>
        )}
      </Box>

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
            }),
          }}
        >
          {items.map((item, index) => (
            <StyledPaper
              key={item.key}
              isCard={isCard}
              elevation={isCard ? 1 : 0}
              sx={{
                mb: isCard ? 2 : 1,
                mt: isCard ? 0 : 1,
                p: isCard ? 2 : 1,
                position: 'relative',
                border: isCard ? '1px solid' : 'none',
                borderColor: isPrimary ? alpha('#2196f3', 0.3) : 'divider',
                backgroundColor: isCard
                  ? (isPrimary ? alpha('#2196f3', 0.03) : 'background.paper')
                  : 'transparent',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  mb: isCard ? 1 : 0.5,
                  alignItems: 'center',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <DragIndicatorIcon
                    sx={{
                      mr: 1,
                      color: 'text.secondary',
                      opacity: 0.6,
                      cursor: 'grab',
                      '&:hover': {
                        opacity: 1,
                      },
                    }}
                  />
                  <Typography
                    variant="subtitle2"
                    color={isPrimary ? 'primary.main' : 'text.primary'}
                    fontWeight="medium"
                  >
                    {`${itemTitle} ${index + 1}`}
                  </Typography>
                </Box>

                <Box>
                  {/* Move up button - only show if not first item */}
                  {index > 0 && (
                    <StyledIconButton
                      size="small"
                      onClick={() => {
                        // Handle move up logic here if needed
                        console.log('Move up:', index);
                      }}
                      title={t('Common.MoveUp', 'Move Up')}
                      aria-label={t('Common.MoveUp', 'Move Up')}
                      sx={{ ml: 0.5 }}
                    >
                      <Typography variant="caption">↑</Typography>
                    </StyledIconButton>
                  )}

                  {/* Move down button - only show if not last item */}
                  {index < items.length - 1 && (
                    <StyledIconButton
                      size="small"
                      onClick={() => {
                        // Handle move down logic here if needed
                        console.log('Move down:', index);
                      }}
                      title={t('Common.MoveDown', 'Move Down')}
                      aria-label={t('Common.MoveDown', 'Move Down')}
                      sx={{ ml: 0.5 }}
                    >
                      <Typography variant="caption">↓</Typography>
                    </StyledIconButton>
                  )}

                  {/* Remove button - always show */}
                  <StyledIconButton
                    size="small"
                    onClick={() => {
                      // Handle remove logic here if needed
                      console.log('Remove:', index);
                    }}
                    title={t('Common.Remove', 'Remove')}
                    aria-label={t('Common.Remove', 'Remove')}
                    color="error"
                    sx={{ ml: 0.5 }}
                  >
                    <DeleteIcon fontSize="small" />
                  </StyledIconButton>
                </Box>
              </Box>

              {isCard && <Divider sx={{ mb: 2 }} />}
              {item.children}
            </StyledPaper>
          ))}
        </Box>
      )}

      {/* Bottom add button for longer lists */}
      {canAdd && hasItems && items.length > 2 && (
        <Button
          startIcon={<AddIcon />}
          onClick={onAddClick}
          variant={isPrimary ? 'contained' : 'outlined'}
          size="small"
          color="primary"
        >
          {t('Common.AddAnother', 'Add Another')}
        </Button>
      )}

      {/* Empty state */}
      {!hasItems && (
        <StyledPaper
          variant="outlined"
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
          <Typography color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
            {t('Common.NoItemsYet', 'No items yet. Click "Add" to add your first item.')}
          </Typography>

          {canAdd && (
            <Button
              startIcon={<AddIcon />}
              onClick={onAddClick}
              variant={isPrimary ? 'contained' : 'outlined'}
              size="small"
              color="primary"
            >
              {t('Common.AddFirst', 'Add First Item')}
            </Button>
          )}
        </StyledPaper>
      )}
    </Box>
  );
};
