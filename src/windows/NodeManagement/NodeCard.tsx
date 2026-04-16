import type { KnownNodeEntry } from '@memeloop/protocol';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DevicesIcon from '@mui/icons-material/Devices';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExtensionIcon from '@mui/icons-material/Extension';
import StorageIcon from '@mui/icons-material/Storage';
import { Box, Button, Card, CardActions, CardContent, Chip, Collapse, IconButton, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { IConnectedPeer } from '@services/memeloopNode/interface';
import React, { useEffect, useState } from 'react';

const StyledCard = styled(Card)(({ theme }) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  transition: 'box-shadow 0.2s',
  '&:hover': {
    boxShadow: theme.shadows[4],
  },
}));

const StatusIndicator = styled(Box)<{
  status: 'online' | 'offline' | 'unknown';
}>(({ theme, status }) => ({
  width: 12,
  height: 12,
  borderRadius: '50%',
  backgroundColor: status === 'online'
    ? theme.palette.success.main
    : status === 'offline'
    ? theme.palette.error.main
    : theme.palette.grey[500],
  marginRight: theme.spacing(1),
}));

const ExpandMore = styled(IconButton)<{ expand: boolean }>(
  ({ theme, expand }) => ({
    transform: expand ? 'rotate(180deg)' : 'rotate(0deg)',
    marginLeft: 'auto',
    transition: theme.transitions.create('transform', {
      duration: theme.transitions.duration.shortest,
    }),
  }),
);

const InfoRow = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  marginTop: theme.spacing(1),
  color: theme.palette.text.secondary,
  fontSize: '0.875rem',
}));

interface NodeCardProps {
  node: IConnectedPeer & {
    isTrusted: boolean;
    knownEntry?: KnownNodeEntry;
  };
  onPair?: (nodeId: string) => void;
  onRevoke?: (nodeId: string) => void;
}

export function NodeCard({
  node,
  onPair,
  onRevoke,
}: NodeCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [capabilities, setCapabilities] = useState<
    {
      tools: string[];
      mcpServers: string[];
      wikis: Array<{ wikiId: string; title?: string }>;
    } | null
  >(null);

  useEffect(() => {
    if (expanded && node.status === 'online') {
      void loadCapabilities();
    }
  }, [expanded, node.nodeId, node.status]);

  const loadCapabilities = async (): Promise<void> => {
    try {
      const wikis = await window.service.memeloopNode.listRemoteWikis(
        node.nodeId,
      );
      setCapabilities({
        tools: [],
        mcpServers: [],
        wikis: wikis.map((w) => ({ wikiId: w.wikiId, title: w.title })),
      });
    } catch {
      setCapabilities(null);
    }
  };

  const handleExpandClick = (): void => {
    setExpanded(!expanded);
  };

  return (
    <StyledCard>
      <CardContent sx={{ flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <StatusIndicator status={node.status} />
          <Typography variant='h6' component='div' sx={{ flex: 1 }}>
            {node.name}
          </Typography>
          {node.isTrusted ? <CheckCircleIcon color='success' fontSize='small' /> : <ErrorIcon color='warning' fontSize='small' />}
        </Box>

        <Typography
          variant='body2'
          color='text.secondary'
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            wordBreak: 'break-all',
            mb: 1,
          }}
        >
          {node.nodeId}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Chip
            label={node.type}
            size='small'
            icon={<DevicesIcon />}
            variant='outlined'
          />
          <Chip
            label={node.status}
            size='small'
            color={node.status === 'online'
              ? 'success'
              : node.status === 'offline'
              ? 'error'
              : 'default'}
            variant='outlined'
          />
          {node.isTrusted && (
            <Chip
              label='Trusted'
              size='small'
              color='success'
              variant='filled'
            />
          )}
        </Box>

        {node.knownEntry && (
          <Typography
            variant='caption'
            color='text.secondary'
            sx={{ display: 'block', mt: 1 }}
          >
            Trust source: {node.knownEntry.trustSource}
            <br />
            Last connected: {new Date(node.knownEntry.lastConnected).toLocaleString()}
          </Typography>
        )}
      </CardContent>

      <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
        <Box>
          {!node.isTrusted && onPair && (
            <Button
              size='small'
              variant='contained'
              color='primary'
              onClick={() => onPair(node.nodeId)}
              disabled={node.status !== 'online'}
            >
              Pair with PIN
            </Button>
          )}
          {node.isTrusted && onRevoke && (
            <Button
              size='small'
              variant='outlined'
              color='error'
              onClick={() => onRevoke(node.nodeId)}
            >
              Revoke Trust
            </Button>
          )}
        </Box>
        <ExpandMore
          expand={expanded}
          onClick={handleExpandClick}
          aria-expanded={expanded}
          aria-label='show more'
        >
          <ExpandMoreIcon />
        </ExpandMore>
      </CardActions>

      <Collapse in={expanded} timeout='auto' unmountOnExit>
        <CardContent sx={{ pt: 0, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant='subtitle2' gutterBottom>
            Capabilities
          </Typography>

          {capabilities === null && (
            <Typography variant='body2' color='text.secondary'>
              Loading capabilities...
            </Typography>
          )}

          {capabilities && (
            <>
              {capabilities.wikis.length > 0 && (
                <InfoRow>
                  <StorageIcon fontSize='small' />
                  <Typography variant='body2'>
                    {capabilities.wikis.length} wiki
                    {capabilities.wikis.length !== 1 ? 's' : ''}
                  </Typography>
                </InfoRow>
              )}

              {capabilities.tools.length > 0 && (
                <InfoRow>
                  <ExtensionIcon fontSize='small' />
                  <Typography variant='body2'>
                    {capabilities.tools.length} tool
                    {capabilities.tools.length !== 1 ? 's' : ''}
                  </Typography>
                </InfoRow>
              )}

              {capabilities.mcpServers.length > 0 && (
                <InfoRow>
                  <ExtensionIcon fontSize='small' />
                  <Typography variant='body2'>
                    {capabilities.mcpServers.length} MCP server
                    {capabilities.mcpServers.length !== 1 ? 's' : ''}
                  </Typography>
                </InfoRow>
              )}

              {capabilities.wikis.length === 0 &&
                capabilities.tools.length === 0 &&
                capabilities.mcpServers.length === 0 && (
                <Typography variant='body2' color='text.secondary'>
                  No capabilities available
                </Typography>
              )}

              {capabilities.wikis.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography
                    variant='caption'
                    color='text.secondary'
                    sx={{ display: 'block', mb: 1 }}
                  >
                    Available Wikis:
                  </Typography>
                  {capabilities.wikis.map((wiki) => (
                    <Typography
                      key={wiki.wikiId}
                      variant='body2'
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        ml: 2,
                        mb: 0.5,
                      }}
                    >
                      • {wiki.title ?? wiki.wikiId}
                    </Typography>
                  ))}
                </Box>
              )}
            </>
          )}
        </CardContent>
      </Collapse>
    </StyledCard>
  );
}
