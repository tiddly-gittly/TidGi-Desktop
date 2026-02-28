/**
 * Tool Approval Message Renderer
 *
 * Renders inline UI for pending tool approval requests.
 * Shows the tool name, parameters, and allow/deny buttons.
 */
import SecurityIcon from '@mui/icons-material/Security';
import { Box, Button, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { memo, useCallback, useState } from 'react';
import { stripToolXml } from './BaseMessageRenderer';
import { MessageRendererProps } from './types';

const ApprovalContainer = styled(Box)`
  width: 100%;
  padding: 12px;
  background: ${props => props.theme.palette.warning.light}22;
  border-radius: 8px;
  border-left: 3px solid ${props => props.theme.palette.warning.main};
`;

const ApprovalHeader = styled(Box)`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
`;

const ParametersBox = styled(Box)`
  background: ${props => props.theme.palette.action.hover};
  padding: 8px;
  border-radius: 4px;
  margin: 8px 0;
  font-family: monospace;
  font-size: 0.85em;
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
`;

const ButtonsContainer = styled(Box)`
  display: flex;
  gap: 8px;
  margin-top: 12px;
`;

interface ApprovalData {
  type: 'tool-approval';
  approvalId: string;
  toolName: string;
  parameters: Record<string, unknown>;
}

function parseApprovalData(content: string): ApprovalData | null {
  const resultMatch = /Result:\s*(.+?)\s*(?:<\/functions_result>|$)/s.exec(content);
  if (!resultMatch) return null;
  try {
    const data = JSON.parse(resultMatch[1]) as ApprovalData;
    if (data.type === 'tool-approval' && data.approvalId) return data;
  } catch { /* */ }
  return null;
}

export const ToolApprovalRenderer: React.FC<MessageRendererProps> = memo(({ message }) => {
  const [decision, setDecision] = useState<'allow' | 'deny' | null>(null);

  const data = parseApprovalData(message.content);

  const handleApprove = useCallback(async () => {
    if (!data || decision) return;
    setDecision('allow');
    try {
      if (window.service?.agentInstance) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        void window.service.agentInstance.resolveToolApproval(data.approvalId, 'allow');
      }
    } catch {
      // Handle error
    }
  }, [data, decision]);

  const handleDeny = useCallback(async () => {
    if (!data || decision) return;
    setDecision('deny');
    try {
      if (window.service?.agentInstance) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        void window.service.agentInstance.resolveToolApproval(data.approvalId, 'deny');
      }
    } catch {
      // Handle error
    }
  }, [data, decision]);

  if (!data) {
    const cleaned = stripToolXml(message.content);
    return cleaned ? <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap' }}>{cleaned}</Typography> : null;
  }

  return (
    <ApprovalContainer>
      <ApprovalHeader>
        <SecurityIcon color='warning' fontSize='small' />
        <Typography variant='subtitle2' color='warning.main'>Tool Approval Required</Typography>
      </ApprovalHeader>

      <Typography variant='body2'>
        The agent wants to execute: <strong>{data.toolName}</strong>
      </Typography>

      <ParametersBox>
        {JSON.stringify(data.parameters, null, 2)}
      </ParametersBox>

      {decision === null && (
        <ButtonsContainer>
          <Button
            variant='contained'
            color='success'
            size='small'
            onClick={handleApprove}
          >
            Allow
          </Button>
          <Button
            variant='outlined'
            color='error'
            size='small'
            onClick={handleDeny}
          >
            Deny
          </Button>
        </ButtonsContainer>
      )}
      {decision !== null && (
        <Typography variant='caption' color={decision === 'allow' ? 'success.main' : 'error.main'}>
          {decision === 'allow' ? 'Approved — executing...' : 'Denied — tool call blocked.'}
        </Typography>
      )}
    </ApprovalContainer>
  );
});

ToolApprovalRenderer.displayName = 'ToolApprovalRenderer';
