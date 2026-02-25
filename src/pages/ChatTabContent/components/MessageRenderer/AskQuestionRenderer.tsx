/**
 * Ask Question Message Renderer
 *
 * Renders inline UI for the ask-question tool call.
 * Shows the question text with clickable option buttons and an optional free-form text input.
 * When the user selects an option or types a response, it's sent as a new user message.
 */
import { useAgentChatStore } from '@/pages/Agent/store/agentChatStore';
import QuestionMarkIcon from '@mui/icons-material/HelpOutline';
import { Box, Button, Chip, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { memo, useCallback, useState } from 'react';
import { MessageRendererProps } from './types';

const QuestionContainer = styled(Box)`
  width: 100%;
  padding: 12px;
  background: ${props => props.theme.palette.action.hover};
  border-radius: 8px;
  border-left: 3px solid ${props => props.theme.palette.info.main};
`;

const QuestionHeader = styled(Box)`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
`;

const OptionsContainer = styled(Box)`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
`;

const FreeformContainer = styled(Box)`
  display: flex;
  gap: 8px;
  margin-top: 12px;
  align-items: flex-end;
`;

interface AskQuestionData {
  type: 'ask-question';
  question: string;
  options?: Array<{ label: string; description?: string }>;
  allowFreeform?: boolean;
}

/**
 * Try to parse ask-question data from a tool result message.
 */
function parseAskQuestionData(content: string): AskQuestionData | null {
  // The content is in <functions_result> wrapper with JSON result
  const resultMatch = /Result:\s*(.+)/s.exec(content);
  if (!resultMatch) return null;

  try {
    const data = JSON.parse(resultMatch[1]) as AskQuestionData;
    if (data.type === 'ask-question' && data.question) return data;
  } catch {
    // Not parseable
  }
  return null;
}

/**
 * AskQuestion renderer — shows an interactive question UI inline.
 */
export const AskQuestionRenderer: React.FC<MessageRendererProps> = memo(({ message }) => {
  const sendMessage = useAgentChatStore(state => state.sendMessage);
  const [freeformText, setFreeformText] = useState('');
  const [answered, setAnswered] = useState(false);

  const data = parseAskQuestionData(message.content);

  const handleOptionClick = useCallback((label: string) => {
    if (answered) return;
    setAnswered(true);
    void sendMessage(label);
  }, [answered, sendMessage]);

  const handleFreeformSubmit = useCallback(() => {
    if (!freeformText.trim() || answered) return;
    setAnswered(true);
    void sendMessage(freeformText.trim());
  }, [freeformText, answered, sendMessage]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleFreeformSubmit();
    }
  }, [handleFreeformSubmit]);

  if (!data) {
    // Fallback for non-parseable content
    return <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap' }}>{message.content}</Typography>;
  }

  return (
    <QuestionContainer>
      <QuestionHeader>
        <QuestionMarkIcon color='info' fontSize='small' />
        <Typography variant='subtitle2' color='info.main'>Agent Question</Typography>
      </QuestionHeader>

      <Typography variant='body1'>{data.question}</Typography>

      {data.options && data.options.length > 0 && (
        <OptionsContainer>
          {data.options.map((option, index) => (
            <Chip
              key={index}
              label={option.label}
              title={option.description}
              onClick={() => {
                handleOptionClick(option.label);
              }}
              clickable={!answered}
              color={answered ? 'default' : 'primary'}
              variant='outlined'
              disabled={answered}
            />
          ))}
        </OptionsContainer>
      )}

      {(data.allowFreeform ?? true) && !answered && (
        <FreeformContainer>
          <TextField
            size='small'
            placeholder='Type your answer...'
            value={freeformText}
            onChange={(event) => {
              setFreeformText(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            fullWidth
            multiline
            maxRows={3}
          />
          <Button
            variant='contained'
            size='small'
            onClick={handleFreeformSubmit}
            disabled={!freeformText.trim()}
          >
            Send
          </Button>
        </FreeformContainer>
      )}

      {answered && (
        <Typography variant='caption' color='text.secondary' sx={{ mt: 1, display: 'block' }}>
          Answer submitted — waiting for agent...
        </Typography>
      )}
    </QuestionContainer>
  );
});

AskQuestionRenderer.displayName = 'AskQuestionRenderer';
