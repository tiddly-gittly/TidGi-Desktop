import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { Accordion, AccordionSummary, alpha, Box, Chip, IconButton, Paper, TextField, Tooltip, Typography } from '@mui/material';
import type { BoxProps } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';

// 基础 Paper 组件 - 使用模板字符串优化主题适配
export const StyledPaper = styled(Paper)<{ isCard?: boolean }>`
  ${({ theme, isCard = false }) => `
    margin-bottom: ${theme.spacing(2)};
    border: 1px solid ${theme.palette.divider};
    border-radius: ${theme.shape.borderRadius}px;
    transition: all 0.2s ease-in-out;
    background-color: ${theme.palette.background.paper};
    
    ${
  isCard
    ? `
      cursor: pointer;
      &:hover {
        border-color: ${theme.palette.primary.main};
        box-shadow: ${
      theme.palette.mode === 'dark'
        ? '0 2px 8px rgba(0,0,0,0.3)'
        : '0 2px 8px rgba(0,0,0,0.08)'
    };
        transform: translateY(-1px);
      }
    `
    : ''
}
  `}
`;

// 优化的手风琴头部组件
export const StyledAccordionHeader: typeof Box = styled(Box).withConfig({
  shouldForwardProp: (property: string) => !['variant'].includes(property),
})<BoxProps>`
  ${({ theme }) => `
    padding: ${theme.spacing(1.5, 2)};
    border-radius: ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px 0 0;
    background: linear-gradient(135deg, 
      ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.1 : 0.05)} 0%,
      ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.05 : 0.02)} 100%
    );
    border-bottom: 1px solid ${alpha(theme.palette.primary.main, 0.2)};
    transition: all 0.2s ease-in-out;
    
    &:hover {
      background: linear-gradient(135deg,
        ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.15 : 0.08)} 0%,
        ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.08 : 0.04)} 100%
      );
    }
  `}
`;

// 优化的通用输入框组件
export const StyledTextField = styled(TextField)`
  ${({ theme }) => `
    width: 100%;
    
    & .MuiOutlinedInput-root {
      transition: all 0.2s ease-in-out;
      background-color: ${theme.palette.background.paper};
      
      & fieldset {
        border-color: ${alpha(theme.palette.text.primary, 0.23)};
      }
      
      &:hover fieldset {
        border-color: ${alpha(theme.palette.primary.main, 0.5)};
      }
      
      &.Mui-focused fieldset {
        border-color: ${theme.palette.primary.main};
        border-width: 2px;
      }
      
      &.Mui-error fieldset {
        border-color: ${theme.palette.error.main};
      }
    }
    
    & .MuiInputLabel-root {
      color: ${theme.palette.text.secondary};
      transition: color 0.2s ease-in-out;
      
      &.Mui-focused {
        color: ${theme.palette.primary.main};
      }
      
      &.Mui-error {
        color: ${theme.palette.error.main};
      }
    }
    
    & .MuiFormHelperText-root {
      color: ${theme.palette.text.secondary};
      font-size: 0.75rem;
      margin-top: ${theme.spacing(0.5)};
      
      &.Mui-error {
        color: ${theme.palette.error.main};
      }
    }
  `}
`;

// 优化的芯片组件
export const StyledChip = styled(Chip)`
  ${({ theme }) => `
    height: 20px;
    font-size: 0.7rem;
    font-weight: 500;
    transition: all 0.2s ease-in-out;
    
    &.MuiChip-sizeSmall {
      height: 20px;
    }
    
    &.MuiChip-outlined {
      border-color: ${alpha(theme.palette.primary.main, 0.5)};
      color: ${theme.palette.primary.main};
      
      &:hover {
        background-color: ${alpha(theme.palette.primary.main, 0.08)};
        border-color: ${theme.palette.primary.main};
      }
    }
    
    &.MuiChip-filled {
      background-color: ${alpha(theme.palette.primary.main, 0.1)};
      color: ${theme.palette.primary.main};
      
      &:hover {
        background-color: ${alpha(theme.palette.primary.main, 0.2)};
      }
    }
  `}
`;

// 优化的图标按钮组件
export const StyledIconButton = styled(IconButton)`
  ${({ theme }) => `
    transition: all 0.2s ease-in-out;
    
    &:hover {
      background-color: ${alpha(theme.palette.primary.main, 0.08)};
      color: ${theme.palette.primary.main};
    }
    
    &:active {
      background-color: ${alpha(theme.palette.primary.main, 0.12)};
    }
  `}
`;

// 通用的帮助图标组件，统一处理 description 的翻译和展示
interface HelpIconProps {
  description?: string;
  variant?: 'primary' | 'warning' | 'info' | 'success' | 'error';
  placement?: 'top' | 'bottom' | 'left' | 'right';
  size?: 'small' | 'medium';
}

export const HelpIcon: React.FC<HelpIconProps> = React.memo(({
  description,
  variant = 'primary',
  placement = 'top',
  size = 'small',
}) => {
  const { t } = useTranslation('agent');

  if (!description) return null;

  return (
    <Tooltip
      title={t(description)}
      placement={placement}
      arrow
      slotProps={{
        tooltip: {
          sx: {
            fontSize: '0.75rem',
            maxWidth: 300,
          },
        },
      }}
    >
      <HelpOutlineIcon
        sx={{
          fontSize: size === 'small' ? 16 : 20,
          ml: 1,
          color: `${variant}.main`,
          opacity: 0.7,
          cursor: 'help',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            opacity: 1,
            transform: 'scale(1.1)',
          },
        }}
      />
    </Tooltip>
  );
});

HelpIcon.displayName = 'HelpIcon';

// 标题组件，统一标题样式和必填标记
interface SectionTitleProps {
  title?: string;
  required?: boolean;
  description?: string;
  itemCount?: number;
  children?: React.ReactNode;
  level?: 1 | 2 | 3;
}

export const SectionTitle: React.FC<SectionTitleProps> = React.memo(({
  title,
  required,
  description,
  itemCount,
  children,
  level = 2,
}) => {
  if (!title) return null;

  const titleVariant = level === 1 ? 'h6' : level === 2 ? 'subtitle1' : 'subtitle2';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        mb: level === 1 ? 2 : 1,
      }}
    >
      <Typography
        variant={titleVariant}
        fontWeight={level === 1 ? 600 : 500}
        color='primary'
        sx={{
          flex: 1,
          transition: 'color 0.2s ease-in-out',
        }}
      >
        {title}
        {required && (
          <Typography component='span' color='error' sx={{ ml: 0.5 }}>
            *
          </Typography>
        )}
      </Typography>

      {/* 项目数量显示 */}
      {typeof itemCount === 'number' && (
        <StyledChip
          label={`${itemCount} items`}
          size='small'
          color='primary'
          variant='outlined'
          sx={{ ml: 1 }}
        />
      )}

      {/* 帮助图标 */}
      {description && (
        <Tooltip
          title={description}
          arrow
          slotProps={{
            tooltip: {
              sx: {
                fontSize: '0.75rem',
                maxWidth: 300,
              },
            },
          }}
        >
          <HelpOutlineIcon
            sx={{
              fontSize: 16,
              ml: 1,
              color: 'primary.main',
              opacity: 0.7,
              cursor: 'help',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                opacity: 1,
                transform: 'scale(1.1)',
              },
            }}
          />
        </Tooltip>
      )}

      {/* 其他子组件 */}
      {children}
    </Box>
  );
});

SectionTitle.displayName = 'SectionTitle';

// 字段标签组件
interface FieldLabelProps {
  label?: string;
  required?: boolean;
  description?: string;
  badges?: Array<{
    text: string;
    color?: 'primary' | 'secondary' | 'default' | 'info' | 'warning' | 'error';
    tooltip?: string;
  }>;
}

export const FieldLabel: React.FC<FieldLabelProps> = React.memo(({
  label,
  required,
  description,
  badges = [],
}) => {
  if (!label) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        mb: 0.5,
        flexWrap: 'wrap',
        gap: 0.5,
      }}
    >
      <Typography
        variant='body1'
        component='label'
        sx={{
          fontWeight: 500,
          color: 'primary.main',
          transition: 'color 0.2s ease-in-out',
          flex: badges.length > 0 ? 'none' : 1,
        }}
      >
        {label}
        {required && (
          <Typography component='span' color='error' sx={{ ml: 0.5 }}>
            *
          </Typography>
        )}
      </Typography>

      {/* 徽章显示 */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {badges.map((badge, index) => (
          badge.tooltip
            ? (
              <Tooltip key={index} title={badge.tooltip}>
                <StyledChip
                  label={badge.text}
                  size='small'
                  variant='outlined'
                  color={badge.color || 'default'}
                />
              </Tooltip>
            )
            : (
              <StyledChip
                key={index}
                label={badge.text}
                size='small'
                variant='outlined'
                color={badge.color || 'default'}
              />
            )
        ))}
      </Box>

      {/* 帮助图标 */}
      {description && (
        <Tooltip
          title={description}
          arrow
          slotProps={{
            tooltip: {
              sx: {
                fontSize: '0.75rem',
                maxWidth: 300,
              },
            },
          }}
        >
          <HelpOutlineIcon
            sx={{
              fontSize: 16,
              ml: 1,
              color: 'primary.main',
              opacity: 0.7,
              cursor: 'help',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                opacity: 1,
                transform: 'scale(1.1)',
              },
            }}
          />
        </Tooltip>
      )}
    </Box>
  );
});

FieldLabel.displayName = 'FieldLabel';

// 通用的错误显示组件
interface ErrorDisplayProps {
  errors?: string | string[];
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = React.memo(({
  errors,
}) => {
  if (!errors) return null;

  const errorArray = Array.isArray(errors) ? errors : [errors];

  return (
    <Box
      sx={(theme) => ({
        mt: 0.5,
        p: 0.5,
        borderRadius: 0.5,
        backgroundColor: alpha(theme.palette.error.main, 0.05),
        border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
      })}
    >
      {errorArray.map((error, index) => (
        <Typography
          key={index}
          variant='caption'
          color='error'
          sx={{ display: 'block' }}
        >
          {error}
        </Typography>
      ))}
    </Box>
  );
});

ErrorDisplay.displayName = 'ErrorDisplay';

// 通用的加载状态组件
interface LoadingStateProps {
  loading: boolean;
  children: React.ReactNode;
}

export const LoadingState: React.FC<LoadingStateProps> = React.memo(({
  loading,
  children,
}) => {
  if (loading) {
    return (
      <Box
        sx={(theme) => ({
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          p: 4,
          color: 'primary.main',
          backgroundColor: alpha(theme.palette.primary.main, 0.05),
          borderRadius: 1,
        })}
      >
        <Typography variant='body2'>
          Loading...
        </Typography>
      </Box>
    );
  }

  return <>{children}</>;
});

LoadingState.displayName = 'LoadingState';

// 样式化的手风琴组件
export const StyledAccordion = styled(Accordion)`
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: ${({ theme }) => theme.shape.borderRadius}px;
  margin-bottom: ${({ theme }) => theme.spacing(2)};
  background-color: ${({ theme }) => theme.palette.background.paper};
  transition: all 0.2s ease-in-out;
  
  &:before {
    display: none;
  }
  
  &.Mui-expanded {
    margin-bottom: ${({ theme }) => theme.spacing(2)};
  }
  
  &:hover {
    border-color: ${({ theme }) => theme.palette.primary.main};
    box-shadow: ${({ theme }) =>
  theme.palette.mode === 'dark'
    ? '0 2px 8px rgba(0,0,0,0.3)'
    : '0 2px 8px rgba(0,0,0,0.08)'};
  }
`;

// 样式化的手风琴摘要组件
export const StyledAccordionSummary = styled(AccordionSummary)`
  background: ${({ theme }) => `linear-gradient(135deg, 
    ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.08 : 0.05)} 0%,
    ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.04 : 0.02)} 100%
  )`};
  border-bottom: ${({ theme }) => `1px solid ${alpha(theme.palette.primary.main, 0.1)}`};
  transition: all 0.2s ease-in-out;

  &:hover {
    background: ${({ theme }) =>
      `linear-gradient(135deg,
      ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.08)} 0%,
      ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.06 : 0.04)} 100%
    )`};
  }
  }
  
  &.Mui-expanded {
    min-height: 48px;
  }
  
  .MuiAccordionSummary-content {
    margin: ${({ theme }) => theme.spacing(1.5, 0)};
    
    &.Mui-expanded {
      margin: ${({ theme }) => theme.spacing(1.5, 0)};
    }
  }
  
  .MuiAccordionSummary-expandIconWrapper {
    color: ${({ theme }) => theme.palette.primary.main};
    transition: transform 0.2s ease-in-out, color 0.2s ease-in-out;
    
    &.Mui-expanded {
      transform: rotate(180deg);
    }
    
    &:hover {
      color: ${({ theme }) => theme.palette.primary.dark};
    }
  }
`;
