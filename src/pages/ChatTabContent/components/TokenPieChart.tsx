/**
 * Token Breakdown Pie Chart
 *
 * Displays a compact pie chart showing context window token usage breakdown.
 * Categories: system, tools, user, assistant, tool results.
 * Shows usage ratio and warning when approaching the limit.
 */
import { Box, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import React, { memo, useMemo } from 'react';

interface TokenBreakdown {
  systemInstructions: number;
  toolDefinitions: number;
  userMessages: number;
  assistantMessages: number;
  toolResults: number;
  total: number;
  limit: number;
}

interface TokenPieChartProps {
  breakdown: TokenBreakdown;
  size?: number;
}

const CATEGORIES = [
  { key: 'systemInstructions', label: 'System', colorIndex: 0 },
  { key: 'toolDefinitions', label: 'Tools', colorIndex: 1 },
  { key: 'userMessages', label: 'User', colorIndex: 2 },
  { key: 'assistantMessages', label: 'Assistant', colorIndex: 3 },
  { key: 'toolResults', label: 'Tool Results', colorIndex: 4 },
] as const;

/**
 * Minimal SVG pie chart — no external chart library needed.
 */
export const TokenPieChart: React.FC<TokenPieChartProps> = memo(({ breakdown, size = 40 }) => {
  const theme = useTheme();

  const colors = useMemo(() => [
    theme.palette.info.main, // System
    theme.palette.warning.main, // Tools
    theme.palette.success.main, // User
    theme.palette.primary.main, // Assistant
    theme.palette.secondary.main, // Tool Results
  ], [theme]);

  const ratio = breakdown.limit > 0 ? breakdown.total / breakdown.limit : 0;
  const percentage = Math.round(ratio * 100);
  const isWarning = ratio > 0.8;
  const isDanger = ratio > 0.95;

  // Build SVG pie slices using conic-gradient technique via SVG arcs
  const slices = useMemo(() => {
    if (breakdown.total === 0) return [];
    const result: Array<{ startAngle: number; endAngle: number; color: string; label: string; value: number }> = [];
    let currentAngle = 0;

    for (const cat of CATEGORIES) {
      const value = breakdown[cat.key];
      if (value <= 0) continue;
      const angle = (value / breakdown.total) * 360;
      result.push({
        startAngle: currentAngle,
        endAngle: currentAngle + angle,
        color: colors[cat.colorIndex],
        label: cat.label,
        value,
      });
      currentAngle += angle;
    }
    return result;
  }, [breakdown, colors]);

  // Convert angle to SVG arc point
  const angleToPoint = (angle: number, radius: number): { x: number; y: number } => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: radius + radius * Math.cos(rad), y: radius + radius * Math.sin(rad) };
  };

  const r = size / 2;

  const tooltipContent = (
    <Box sx={{ p: 0.5 }}>
      <Typography variant='caption' fontWeight='bold'>
        Context Window: {breakdown.total.toLocaleString()} / {breakdown.limit.toLocaleString()} tokens ({percentage}%)
      </Typography>
      {CATEGORIES.map(cat => {
        const value = breakdown[cat.key];
        if (value <= 0) return null;
        return (
          <Box key={cat.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colors[cat.colorIndex] }} />
            <Typography variant='caption'>{cat.label}: {value.toLocaleString()} ({Math.round(value / breakdown.total * 100)}%)</Typography>
          </Box>
        );
      })}
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} arrow placement='top'>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'pointer',
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background circle (remaining capacity) */}
          <circle cx={r} cy={r} r={r} fill={theme.palette.action.hover} />

          {/* Pie slices */}
          {slices.map((slice, index) => {
            const start = angleToPoint(slice.startAngle, r);
            const end = angleToPoint(slice.endAngle, r);
            const largeArc = slice.endAngle - slice.startAngle > 180 ? 1 : 0;
            const d = `M${r},${r} L${start.x},${start.y} A${r},${r} 0 ${largeArc},1 ${end.x},${end.y} Z`;
            return <path key={index} d={d} fill={slice.color} opacity={0.85} />;
          })}

          {/* Center hole for donut style */}
          <circle cx={r} cy={r} r={r * 0.45} fill={theme.palette.background.paper} />

          {/* Center text */}
          <text
            x={r}
            y={r}
            textAnchor='middle'
            dominantBaseline='central'
            fontSize={size * 0.22}
            fontWeight='bold'
            fill={isDanger ? theme.palette.error.main : isWarning ? theme.palette.warning.main : theme.palette.text.primary}
          >
            {percentage}%
          </text>
        </svg>
      </Box>
    </Tooltip>
  );
});

TokenPieChart.displayName = 'TokenPieChart';
