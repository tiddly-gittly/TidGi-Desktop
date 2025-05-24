import { Box, List, Paper, styled, Typography } from '@mui/material';
import React from 'react';

export interface PreviewMessage {
  role: string;
  content: string;
}

const MessageItem = styled(Paper)(({ theme }) => ({
  marginBottom: theme.spacing(1.5),
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${theme.palette.divider}`,
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    boxShadow: theme.shadows[2],
  },
}));

const RoleChip = styled(Typography, {
  shouldForwardProp: (property: string) => property !== 'role',
})<{ role: string }>(({ theme, role }) => ({
  display: 'inline-block',
  padding: theme.spacing(0.5, 1),
  borderRadius: theme.shape.borderRadius / 2,
  fontSize: 12,
  fontWeight: 600,
  marginBottom: theme.spacing(1),
  background: (() => {
    switch (role.toLowerCase()) {
      case 'system':
        return theme.palette.info.main;
      case 'assistant':
        return theme.palette.success.main;
      case 'user':
        return theme.palette.primary.main;
      default:
        return theme.palette.grey[500];
    }
  })(),
  color: theme.palette.common.white,
}));

const EmptyState = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: 240,
  color: theme.palette.text.secondary,
  '& > svg': {
    fontSize: 48,
    marginBottom: theme.spacing(2),
    opacity: 0.5,
  },
}));

/**
 * Flat prompt list component
 */
export const FlatPromptList = React.memo(({ flatPrompts }: { flatPrompts?: PreviewMessage[] }): React.ReactElement => {
  if (!flatPrompts?.length) {
    return <EmptyState>No messages to preview</EmptyState>;
  }

  return (
    <List disablePadding>
      {flatPrompts.map((message, index) => (
        <MessageItem key={index} elevation={0}>
          <RoleChip role={message.role} variant='caption'>
            {message.role.toUpperCase()}
          </RoleChip>
          <Typography
            variant='body2'
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'inherit',
            }}
          >
            {message.content}
          </Typography>
        </MessageItem>
      ))}
    </List>
  );
});
