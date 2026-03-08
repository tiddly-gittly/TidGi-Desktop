/**
 * TodoList Message Renderer
 *
 * Renders the agent's todo / plan list inline in the chat, similar to
 * VS Code Copilot Chat's task-tracking panel.  Shows a nested checkbox tree
 * with a progress bar summarising completion.
 */
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import { Box, LinearProgress, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { memo, useMemo } from 'react';
import { stripToolXml } from './BaseMessageRenderer';
import { MessageRendererProps } from './types';

/* ------------------------------------------------------------------ */
/*  Styling                                                            */
/* ------------------------------------------------------------------ */

const TodoContainer = styled(Box)`
  width: 100%;
  padding: 10px 12px;
  background: ${p => p.theme.palette.action.hover};
  border-radius: 8px;
  border-left: 3px solid ${p => p.theme.palette.primary.main};
`;

const TodoHeader = styled(Box)`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
`;

const TodoItem = styled(Box)<{ depth: number }>`
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 2px 0;
  padding-left: ${p => p.depth * 20}px;
`;

const ProgressRow = styled(Box)`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
`;

/* ------------------------------------------------------------------ */
/*  Types & parsing                                                    */
/* ------------------------------------------------------------------ */

interface TodoNode {
  text: string;
  done: boolean;
  depth: number;
}

interface TodoUpdateData {
  type: 'todo-update';
  tiddlerTitle: string;
  text: string;
  itemCount: number;
  completedCount: number;
}

function parseTodoUpdateData(content: string): TodoUpdateData | null {
  const match = /Result:\s*(.+?)\s*(?:<\/functions_result>|$)/s.exec(content);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]) as TodoUpdateData;
    if (data.type === 'todo-update' && typeof data.text === 'string') return data;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Parse the plain-text todo list into a flat list of TodoNode with depth info.
 *
 * Expected format:
 *   - [x] Done item
 *   - [ ] Open item
 *     - [ ] Child item
 */
function parseTodoNodes(text: string): TodoNode[] {
  const lines = text.split('\n');
  const nodes: TodoNode[] = [];
  for (const line of lines) {
    const match = /^(\s*)- \[([ x])\] (.*)$/.exec(line);
    if (!match) continue;
    const indent = match[1].length;
    // Every 2 spaces of indent = 1 depth level
    const depth = Math.floor(indent / 2);
    nodes.push({ text: match[3], done: match[2] === 'x', depth });
  }
  return nodes;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const TodoListRenderer: React.FC<MessageRendererProps> = memo(({ message }) => {
  const data = parseTodoUpdateData(message.content);

  const nodes = useMemo(() => {
    if (!data) return [];
    return parseTodoNodes(data.text);
  }, [data]);

  if (!data || nodes.length === 0) {
    const cleaned = stripToolXml(message.content);
    return cleaned ? <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap' }}>{cleaned}</Typography> : null;
  }

  const total = nodes.length;
  const completed = nodes.filter(n => n.done).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <TodoContainer>
      <TodoHeader>
        <TaskAltIcon color='primary' fontSize='small' />
        <Typography variant='subtitle2' color='primary.main'>
          Agent Plan
        </Typography>
        <Typography variant='caption' color='text.secondary'>
          {completed}/{total} done
        </Typography>
      </TodoHeader>

      {nodes.map((node, index) => (
        <TodoItem key={index} depth={node.depth}>
          {node.done
            ? <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main', mt: '2px' }} />
            : <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: 'text.disabled', mt: '2px' }} />}
          <Typography
            variant='body2'
            sx={{
              textDecoration: node.done ? 'line-through' : 'none',
              color: node.done ? 'text.disabled' : 'text.primary',
            }}
          >
            {node.text}
          </Typography>
        </TodoItem>
      ))}

      <ProgressRow>
        <LinearProgress
          variant='determinate'
          value={pct}
          sx={{ flex: 1, height: 6, borderRadius: 3 }}
        />
        <Typography variant='caption' color='text.secondary'>{pct}%</Typography>
      </ProgressRow>
    </TodoContainer>
  );
});

TodoListRenderer.displayName = 'TodoListRenderer';
