import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { IconButton, Tooltip } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';

const StyledHelpButton = styled(IconButton)`
  padding: ${({ theme }) => theme.spacing(0.25)};
  color: ${({ theme }) => theme.palette.text.secondary};

  &:hover {
    color: ${({ theme }) => theme.palette.primary.main};
  }
`;

const StyledHelpIcon = styled(HelpOutlineIcon)`
  font-size: ${({ theme }) => theme.typography.caption.fontSize};
`;

interface HelpTooltipProps {
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({
  description,
  placement = 'top',
}) => {
  const { t } = useTranslation('agent');

  // Ensure description is a string before processing
  if (typeof description !== 'string' || !description) {
    return description;
  }

  // Try to translate description if it looks like an i18n key
  const tooltipText = React.useMemo(() => {
    if (description.includes('.') && !description.includes(' ')) {
      // Likely an i18n key
      return t(description, description);
    }
    return description;
  }, [description, t]);

  return (
    <Tooltip title={tooltipText} placement={placement} arrow>
      <StyledHelpButton size='small'>
        <StyledHelpIcon />
      </StyledHelpButton>
    </Tooltip>
  );
};
