import { alpha, Box } from '@mui/material';
import { FieldTemplateProps, getUiOptions } from '@rjsf/utils';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorDisplay, FieldLabel } from '../components/SharedComponents';

/**
 * 优化的字段模板，提供增强的样式和布局
 * 特点：
 * - 使用样式化组件提高一致性和主题支持
 * - 统一的描述显示通过工具提示
 * - 性能优化，减少不必要的渲染
 */
export const CustomFieldTemplate = React.memo(({
  id: _id,
  label,
  help,
  required,
  description,
  errors,
  children,
  schema,
  hidden,
  uiSchema,
  displayLabel,
}: FieldTemplateProps): React.ReactElement => {
  const { t } = useTranslation('agent');

  // 隐藏字段直接返回子组件
  if (hidden) {
    return <>{children}</>;
  }

  // 简化的UI选项处理，减少依赖
  const uiOptions = useMemo(() => getUiOptions(uiSchema), [uiSchema]);

  // 判断是否显示标签
  const showLabel = displayLabel !== false && label && schema.type !== 'object';

  // 帮助文本处理
  const helpText = typeof help === 'string' ? help : typeof description === 'string' ? description : undefined;

  // 减少依赖的样式flags
  const isPrimary = uiOptions.variant === 'primary' || schema.format === 'primary';
  const isHighlighted = uiOptions.highlight === true || schema.format === 'highlight';
  const isReadOnly = schema.readOnly === true || uiOptions.readOnly === true;
  const isAdvanced = uiOptions.advanced === true;

  // 简化的徽章数组生成
  const badges = useMemo(() => {
    const badgeList = [];

    if (isReadOnly) {
      badgeList.push({
        text: t('Common.ReadOnly', '只读'),
        color: 'default' as const,
      });
    }

    if (isAdvanced) {
      badgeList.push({
        text: t('Common.Advanced', '高级'),
        color: 'secondary' as const,
      });
    }

    if (schema.pattern) {
      badgeList.push({
        text: t('Common.Pattern', '格式'),
        color: 'info' as const,
        tooltip: t('Common.PatternValidation', '此字段有格式验证'),
      });
    }

    if (uiOptions.badge && typeof uiOptions.badge === 'string') {
      badgeList.push({
        text: uiOptions.badge,
        color: isPrimary ? ('primary' as const) : ('default' as const),
      });
    }

    return badgeList;
  }, [isReadOnly, isAdvanced, schema.pattern, uiOptions.badge, isPrimary, t]);

  // 格式提示
  const formatHint = useMemo(() => {
    if (!schema.format || errors) return null;

    const supportedFormats = ['date', 'date-time', 'email', 'uri', 'regex'];
    if (!supportedFormats.includes(schema.format)) return null;

    return t(`Format.${schema.format}`, `格式: ${schema.format}`);
  }, [schema.format, errors, t]);

  // 使用样式化组件替代内联样式
  return (
    <Box
      sx={{
        mb: 2,
        p: isHighlighted ? 2 : 1,
        border: isHighlighted ? '1px solid' : 'none',
        borderColor: isPrimary ? 'primary.main' : 'divider',
        borderRadius: isHighlighted ? 1 : 0,
        backgroundColor: isHighlighted
          ? (theme) => alpha(theme.palette.primary.main, 0.05)
          : 'transparent',
        transition: 'all 0.2s ease-in-out',
      }}
    >
      {showLabel && (
        <FieldLabel
          label={label}
          required={required}
          description={helpText}
          badges={badges}
        />
      )}

      {/* 表单控件 */}
      <Box
        sx={isPrimary
          ? {
            '& .MuiOutlinedInput-root': {
              '& fieldset': {
                borderColor: (theme) => alpha(theme.palette.primary.main, 0.5),
              },
              '&:hover fieldset': {
                borderColor: 'primary.main',
              },
            },
          }
          : {}}
      >
        {children}
      </Box>

      {/* 错误信息 */}
      {errors && (
        typeof errors === 'string'
          ? <ErrorDisplay errors={errors} />
          : Array.isArray(errors)
          ? <ErrorDisplay errors={errors} />
          : React.isValidElement(errors)
          ? errors
          : null
      )}

      {/* 特定字段格式的提示 */}
      {formatHint && (
        <Box
          sx={(theme) => ({
            mt: 0.5,
            fontSize: '0.75rem',
            color: theme.palette.text.secondary,
            fontStyle: 'italic',
          })}
        >
          {formatHint}
        </Box>
      )}
    </Box>
  );
});

CustomFieldTemplate.displayName = 'CustomFieldTemplate';
