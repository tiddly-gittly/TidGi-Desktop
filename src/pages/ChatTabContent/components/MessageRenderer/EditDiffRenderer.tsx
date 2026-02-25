/**
 * EditDiff Message Renderer
 *
 * Renders a compact diff summary for edit-tiddler tool results, showing:
 *  • Tiddler title link
 *  • +N / -N line counts in green/red chips (like VS Code's git changes indicator)
 *  • Expandable unified diff snippet
 */
import EditIcon from '@mui/icons-material/EditNote';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Accordion, AccordionDetails, AccordionSummary, Box, Chip, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { memo } from 'react';
import { MessageRendererProps } from './types';

const DiffContainer = styled(Box)`
  width: 100%;
  padding: 8px 12px;
  background: ${p => p.theme.palette.action.hover};
  border-radius: 8px;
  border-left: 3px solid ${p => p.theme.palette.warning.main};
`;

const DiffHeader = styled(Box)`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const DiffCodeBlock = styled('pre')`
  margin: 0;
  padding: 8px;
  font-size: 12px;
  line-height: 1.4;
  overflow-x: auto;
  background: ${p => p.theme.palette.background.default};
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;

  .diff-add {
    color: ${p => p.theme.palette.success.main};
  }
  .diff-remove {
    color: ${p => p.theme.palette.error.main};
  }
  .diff-hunk {
    color: ${p => p.theme.palette.info.main};
  }
`;

interface EditTiddlerDiffData {
  type: 'edit-tiddler-diff';
  title: string;
  workspaceName: string;
  linesAdded: number;
  linesRemoved: number;
  diffSummary: string;
}

function parseEditDiffData(content: string): EditTiddlerDiffData | null {
  const resultMatch = /Result:\s*(.+)/s.exec(content);
  if (!resultMatch) return null;
  try {
    const data = JSON.parse(resultMatch[1]) as EditTiddlerDiffData;
    if (data.type === 'edit-tiddler-diff' && data.title) return data;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Render a single diff line with syntax highlighting.
 */
function DiffLine({ line }: { line: string }) {
  if (line.startsWith('+')) {
    return <span className='diff-add'>{line}</span>;
  }
  if (line.startsWith('-')) {
    return <span className='diff-remove'>{line}</span>;
  }
  if (line.startsWith('@@')) {
    return <span className='diff-hunk'>{line}</span>;
  }
  return <span>{line}</span>;
}

export const EditDiffRenderer: React.FC<MessageRendererProps> = memo(({ message }) => {
  const data = parseEditDiffData(message.content);

  if (!data) {
    return <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap' }}>{message.content}</Typography>;
  }

  const diffLines = data.diffSummary.split('\n');

  return (
    <DiffContainer>
      <DiffHeader>
        <EditIcon color='warning' fontSize='small' />
        <Typography variant='subtitle2' noWrap title={data.title}>
          {data.title}
        </Typography>
        {data.linesAdded > 0 && <Chip label={`+${data.linesAdded}`} size='small' color='success' variant='outlined' sx={{ fontWeight: 700, fontSize: '0.75rem' }} />}
        {data.linesRemoved > 0 && <Chip label={`-${data.linesRemoved}`} size='small' color='error' variant='outlined' sx={{ fontWeight: 700, fontSize: '0.75rem' }} />}
        <Typography variant='caption' color='text.secondary'>
          in {data.workspaceName}
        </Typography>
      </DiffHeader>

      <Accordion disableGutters elevation={0} sx={{ mt: 1, background: 'transparent', '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 28, p: 0 }}>
          <Typography variant='caption' color='text.secondary'>Show diff</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0 }}>
          <DiffCodeBlock>
            {diffLines.map((line, index) => (
              <React.Fragment key={index}>
                <DiffLine line={line} />
                {'\n'}
              </React.Fragment>
            ))}
          </DiffCodeBlock>
        </AccordionDetails>
      </Accordion>
    </DiffContainer>
  );
});

EditDiffRenderer.displayName = 'EditDiffRenderer';
