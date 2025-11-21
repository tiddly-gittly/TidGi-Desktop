/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Box, Typography } from '@mui/material';
import { ArrayFieldTemplateProps } from '@rjsf/utils';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrayAddButton, ArrayContainer, ArrayHeader, ArrayItemCount, EmptyState, HelpTooltip, StyledFieldLabel } from '../components';

/**
 * Enhanced Array Field Template
 * In RJSF 6.x, items are pre-rendered ReactElements, so we just display them
 * The drag-and-drop and collapse logic is handled in ArrayFieldItemTemplate
 */
export const ArrayFieldTemplate: React.FC<ArrayFieldTemplateProps> = (props) => {
  const { items, onAddClick, canAdd, title, schema } = props;
  const { t } = useTranslation('agent');

  const description = schema.description;

  return (
    <ArrayContainer>
      {title && (
        <ArrayHeader>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <StyledFieldLabel component='h3' variant='subtitle1'>
              {t(title)}
            </StyledFieldLabel>
            {typeof description === 'string' && description && <HelpTooltip description={description} />}
          </Box>
          {items.length > 0 && <ArrayItemCount>{t('PromptConfig.ItemCount', { count: items.length })}</ArrayItemCount>}
        </ArrayHeader>
      )}

      {canAdd && items.length > 0 && (
        <ArrayAddButton
          onAddClick={onAddClick}
          variant='top'
        />
      )}

      {items.length === 0
        ? (
          <EmptyState>
            <Typography variant='body2'>{t('PromptConfig.EmptyArray')}</Typography>
          </EmptyState>
        )
        : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {items}
          </Box>
        )}

      {canAdd && (
        <ArrayAddButton
          onAddClick={onAddClick}
          variant={items.length === 0 ? 'top' : 'default'}
        />
      )}
    </ArrayContainer>
  );
};
