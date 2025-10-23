import BugReportIcon from '@mui/icons-material/BugReport';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Accordion, AccordionDetails, AccordionSummary, Box, Chip, Dialog, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ExternalAPILogEntity } from '@services/database/schema/externalAPILog';

const StyledDialogTitle = styled(DialogTitle)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
`;

const LogHeader = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const LogContent = styled(Box)`
  font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
`;

const StatusChip = styled(Chip)<{ status: string }>`
  ${({ status, theme }) => {
  switch (status) {
    case 'done':
      return `background-color: ${theme.palette.success.light}; color: ${theme.palette.success.contrastText};`;
    case 'error':
      return `background-color: ${theme.palette.error.light}; color: ${theme.palette.error.contrastText};`;
    case 'start':
      return `background-color: ${theme.palette.info.light}; color: ${theme.palette.info.contrastText};`;
    case 'update':
      return `background-color: ${theme.palette.warning.light}; color: ${theme.palette.warning.contrastText};`;
    default:
      return `background-color: ${theme.palette.grey[300]};`;
  }
}}
`;

interface APILogsDialogProps {
  open: boolean;
  onClose: () => void;
  agentInstanceId?: string;
}

export const APILogsDialog: React.FC<APILogsDialogProps> = ({
  open,
  onClose,
  agentInstanceId,
}) => {
  const { t } = useTranslation('agent');
  const [logs, setLogs] = useState<ExternalAPILogEntity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && agentInstanceId) {
      void loadLogs();
    }
  }, [open, agentInstanceId]);

  const loadLogs = async () => {
    if (!agentInstanceId) return;

    setLoading(true);
    try {
      const apiLogs = await window.service.externalAPI.getAPILogs(agentInstanceId, 50, 0);
      // Filter out embedding logs on the frontend as well
      const filteredLogs = apiLogs.filter(log => log.callType !== 'embedding');
      setLogs(filteredLogs);
    } catch (error) {
      console.error('Failed to load API logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(date));
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'start':
        return t('APILogs.StatusStart');
      case 'update':
        return t('APILogs.StatusUpdate');
      case 'done':
        return t('APILogs.StatusDone');
      case 'error':
        return t('APILogs.StatusError');
      case 'cancel':
        return t('APILogs.StatusCancel');
      default:
        return status;
    }
  };

  const hasResponseContent = (rc: unknown): boolean => {
    if (rc == null) return false;
    if (typeof rc === 'string') return rc.length > 0;
    try {
      return JSON.stringify(rc).length > 0;
    } catch {
      return true;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth='lg'
      fullWidth
      slotProps={{
        paper: {
          style: { minHeight: '80vh' },
        },
      }}
    >
      <StyledDialogTitle>
        <Box display='flex' alignItems='center' gap={1}>
          <BugReportIcon color='primary' />
          <Box>
            <Typography variant='h6'>
              {t('APILogs.Title')}
            </Typography>
            {agentInstanceId && (
              <Typography variant='caption' color='textSecondary'>
                Agent ID: {agentInstanceId}
              </Typography>
            )}
          </Box>
        </Box>
        <IconButton onClick={onClose} edge='end'>
          <CloseIcon />
        </IconButton>
      </StyledDialogTitle>

      <DialogContent>
        {loading ? <Typography>{t('Loading')}</Typography> : logs.length === 0
          ? (
            <Typography color='textSecondary' align='center' sx={{ py: 4 }}>
              {t('APILogs.NoLogs')}
            </Typography>
          )
          : (
            <Box>
              <Box>
                <Typography variant='body2' color='textSecondary' gutterBottom>
                  {t('APILogs.Description')}
                </Typography>
                {agentInstanceId && (
                  <Typography variant='body2' color='textSecondary' sx={{ fontStyle: 'italic' }}>
                    {t('APILogs.CurrentAgent', { agentId: agentInstanceId })}
                  </Typography>
                )}
              </Box>

              {logs.map((log, index) => (
                <Accordion key={log.id} defaultExpanded={index === 0}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <LogHeader sx={{ width: '100%', mr: 2 }}>
                      <Box display='flex' alignItems='center' gap={2}>
                        <StatusChip
                          status={log.status}
                          label={getStatusText(log.status)}
                          size='small'
                        />
                        <Typography variant='body2' fontWeight='bold'>
                          {log.requestMetadata.provider} / {log.requestMetadata.model}
                        </Typography>
                        <Typography variant='caption' color='textSecondary'>
                          {formatTime(log.createdAt)}
                        </Typography>
                      </Box>
                      <Box display='flex' alignItems='center' gap={1}>
                        {log.responseMetadata?.duration && (
                          <Chip
                            label={`${log.responseMetadata.duration}ms`}
                            size='small'
                            variant='outlined'
                          />
                        )}
                        <Chip
                          label={log.callType}
                          size='small'
                          variant='outlined'
                        />
                      </Box>
                    </LogHeader>
                  </AccordionSummary>

                  <AccordionDetails>
                    <Box display='flex' flexDirection='column' gap={2}>
                      {/* Request Details */}
                      <Box>
                        <Typography variant='subtitle2' gutterBottom>
                          {t('APILogs.RequestDetails')}
                        </Typography>
                        <LogContent>
                          {JSON.stringify(
                            {
                              metadata: log.requestMetadata,
                              payload: log.requestPayload,
                            },
                            null,
                            2,
                          )}
                        </LogContent>
                      </Box>

                      {/* Response Content: always show block; display placeholder when missing */}
                      <Box>
                        <Typography variant='subtitle2' gutterBottom>
                          {t('APILogs.ResponseContent')}
                        </Typography>
                        <LogContent>
                          {hasResponseContent(log.responseContent)
                            ? log.responseContent
                            : t('APILogs.NoResponse')}
                        </LogContent>
                      </Box>

                      {/* Response Metadata */}
                      {log.responseMetadata && (
                        <Box>
                          <Typography variant='subtitle2' gutterBottom>
                            {t('APILogs.ResponseMetadata')}
                          </Typography>
                          <LogContent>
                            {JSON.stringify(log.responseMetadata, null, 2)}
                          </LogContent>
                        </Box>
                      )}

                      {/* Error Details */}
                      {log.errorDetail && (
                        <Box>
                          <Typography variant='subtitle2' gutterBottom color='error'>
                            {t('APILogs.ErrorDetails')}
                          </Typography>
                          <LogContent>
                            {JSON.stringify(log.errorDetail, null, 2)}
                          </LogContent>
                        </Box>
                      )}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          )}
      </DialogContent>
    </Dialog>
  );
};
