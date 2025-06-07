import AddIcon from '@mui/icons-material/Add';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyledArrayAddButton } from './StyledButtons';

interface ArrayAddButtonProps {
  /** Function to call when the add button is clicked */
  onAddClick: () => void;
  /** Whether the button should be disabled */
  disabled?: boolean;
  /** Additional variant for styling - 'top' shows a more prominent style */
  variant?: 'default' | 'top';
}

/**
 * Add button component for array fields
 * Features:
 * - Prominent styling with icon
 * - Full width
 * - Proper translations
 * - Accessibility support
 */
export const ArrayAddButton: React.FC<ArrayAddButtonProps> = ({
  onAddClick,
  disabled = false,
  variant = 'default',
}) => {
  const { t } = useTranslation('agent');

  return (
    <StyledArrayAddButton
      variant='outlined'
      startIcon={<AddIcon />}
      onClick={onAddClick}
      disabled={disabled}
      fullWidth
      size={variant === 'top' ? 'large' : 'medium'}
      sx={{
        ...(variant === 'top' && {
          borderStyle: 'dashed',
          borderWidth: 2,
          minHeight: 56,
        }),
      }}
    >
      {t('PromptConfig.AddItem')}
    </StyledArrayAddButton>
  );
};
