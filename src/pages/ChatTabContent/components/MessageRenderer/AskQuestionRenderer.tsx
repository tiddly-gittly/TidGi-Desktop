/**
 * Ask Question Message Renderer
 *
 * Renders inline UI for the ask-question tool call — styled after VSCode Copilot.
 * Each option occupies a full row with hover tooltip showing description.
 * Supports three input types:
 * - single-select: clickable full-width option buttons (pick one)
 * - multi-select: checkboxes with labels + submit button
 * - text: free-form text input only
 * All modes can optionally show a freeform text box for custom input.
 */
import { useAgentChatStore } from '@/pages/Agent/store/agentChatStore';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import QuestionMarkIcon from '@mui/icons-material/HelpOutline';
import SendIcon from '@mui/icons-material/Send';
import { Box, Button, ButtonBase, Checkbox, FormGroup, TextField, Tooltip, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { memo, useCallback, useState } from 'react';
import { stripToolXml } from './BaseMessageRenderer';
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

/** VSCode-style option row: full-width, outlined, hover highlight */
const OptionButton = styled(ButtonBase, {
  shouldForwardProp: (property) => property !== '$selected',
})<{ $selected?: boolean; disabled?: boolean }>`
  display: flex;
  align-items: flex-start;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid ${props => props.$selected ? props.theme.palette.primary.main : props.theme.palette.divider};
  background: ${props => props.$selected ? props.theme.palette.primary.main + '14' : props.theme.palette.background.paper};
  transition: background 0.15s, border-color 0.15s;
  cursor: ${props => (props.disabled ? 'default' : 'pointer')};
  opacity: ${props => (props.disabled ? 0.6 : 1)};
  
  &:hover:not(:disabled) {
    background: ${props => props.$selected ? props.theme.palette.primary.main + '22' : props.theme.palette.action.hover};
    border-color: ${props => props.theme.palette.primary.main};
  }
`;

const OptionsStack = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  questionId?: string;
  question: string;
  inputType?: 'single-select' | 'multi-select' | 'text';
  options?: Array<{ label: string; description?: string }>;
  allowFreeform?: boolean;
}

function parseAskQuestionData(content: string): AskQuestionData | null {
  const resultMatch = /Result:\s*(.+?)\s*(?:<\/functions_result>|$)/s.exec(content);
  if (!resultMatch) return null;

  try {
    const data = JSON.parse(resultMatch[1]) as AskQuestionData;
    if (data.type === 'ask-question' && data.question) return data;
  } catch {
    // Not parseable
  }
  return null;
}

/** Wrap option in tooltip only when description exists */
const OptionWithTooltip: React.FC<{ description?: string; children: React.ReactElement }> = ({ description, children }) => {
  if (!description) return children;
  return (
    <Tooltip title={description} placement='top' arrow enterDelay={300}>
      {children}
    </Tooltip>
  );
};

export const AskQuestionRenderer: React.FC<MessageRendererProps> = memo(({ message }) => {
  const sendMessage = useAgentChatStore(state => state.sendMessage);
  const [freeformText, setFreeformText] = useState('');
  const [checkedOptions, setCheckedOptions] = useState<Set<string>>(new Set());
  const [answered, setAnswered] = useState(() => {
    return !!(message.metadata)?.askQuestionAnswered;
  });

  const data = parseAskQuestionData(message.content);
  const inputType = data?.inputType ?? 'single-select';
  const questionId = data?.questionId;

  /**
   * Send the user's answer. If the question has a questionId, resolve it via IPC
   * (same-turn tool result pattern). Otherwise fall back to sendMessage (new turn).
   */
  const submitAnswer = useCallback((answer: string) => {
    if (questionId && message.agentId && window.service?.agentInstance) {
      // resolveAskQuestion sends the answer as a tool result (same turn), not as a new user message
      void (window.service.agentInstance.resolveAskQuestion as (agentId: string, questionId: string, answer: string) => Promise<void>)(message.agentId, questionId, answer);
    } else {
      // Fallback for legacy messages without questionId
      void sendMessage(answer);
    }
  }, [questionId, message.agentId, sendMessage]);

  const markAnswered = useCallback(() => {
    setAnswered(true);
    if (window.service?.agentInstance && message.agentId) {
      void window.service.agentInstance.debounceUpdateMessage(
        { ...message, metadata: { ...message.metadata, askQuestionAnswered: true } },
        message.agentId,
        0,
      );
    }
  }, [message]);

  // Single-select: click an option → send immediately
  const handleOptionClick = useCallback((label: string) => {
    if (answered) return;
    markAnswered();
    submitAnswer(label);
  }, [answered, markAnswered, submitAnswer]);

  // Multi-select: toggle checkbox
  const handleToggleOption = useCallback((label: string) => {
    setCheckedOptions(previous => {
      const next = new Set(previous);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  // Multi-select: submit all checked + optional freeform
  const handleMultiSelectSubmit = useCallback(() => {
    if (answered) return;
    const parts: string[] = [...checkedOptions];
    if (freeformText.trim()) parts.push(freeformText.trim());
    if (parts.length === 0) return;
    markAnswered();
    submitAnswer(parts.join(', '));
  }, [answered, checkedOptions, freeformText, markAnswered, submitAnswer]);

  // Text: submit freeform
  const handleFreeformSubmit = useCallback(() => {
    if (!freeformText.trim() || answered) return;
    markAnswered();
    submitAnswer(freeformText.trim());
  }, [freeformText, answered, markAnswered, submitAnswer]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (inputType === 'multi-select') handleMultiSelectSubmit();
      else handleFreeformSubmit();
    }
  }, [handleFreeformSubmit, handleMultiSelectSubmit, inputType]);

  if (!data) {
    const cleaned = stripToolXml(message.content);
    return cleaned ? <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap' }}>{cleaned}</Typography> : null;
  }

  return (
    <QuestionContainer data-testid='ask-question-container'>
      <QuestionHeader>
        <QuestionMarkIcon color='info' fontSize='small' />
        <Typography variant='subtitle2' color='info.main'>Agent Question</Typography>
      </QuestionHeader>

      <Typography variant='body1' sx={{ whiteSpace: 'pre-wrap' }}>{data.question}</Typography>

      {/* Single-select: full-width option buttons — removed from DOM once answered */}
      {!answered && inputType === 'single-select' && data.options && data.options.length > 0 && (
        <OptionsStack data-testid='ask-question-options'>
          {data.options.map((option, index) => (
            <OptionWithTooltip key={index} description={option.description}>
              <OptionButton
                onClick={() => {
                  handleOptionClick(option.label);
                }}
                data-testid={`ask-question-option-${index}`}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant='body2' sx={{ wordBreak: 'break-word' }}>
                    {option.label}
                  </Typography>
                </Box>
              </OptionButton>
            </OptionWithTooltip>
          ))}
        </OptionsStack>
      )}

      {/* Multi-select: checkboxes with full-width rows — removed from DOM once answered */}
      {!answered && inputType === 'multi-select' && data.options && data.options.length > 0 && (
        <FormGroup sx={{ mt: 1, gap: '4px' }} data-testid='ask-question-multiselect'>
          {data.options.map((option, index) => (
            <OptionWithTooltip key={index} description={option.description}>
              <OptionButton
                $selected={checkedOptions.has(option.label)}
                onClick={() => {
                  handleToggleOption(option.label);
                }}
                data-testid={`ask-question-option-${index}`}
              >
                <Checkbox
                  checked={checkedOptions.has(option.label)}
                  size='small'
                  sx={{ p: 0, mr: 1, mt: '2px' }}
                  tabIndex={-1}
                  data-testid={`ask-question-checkbox-${index}`}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant='body2' sx={{ wordBreak: 'break-word' }}>
                    {option.label}
                  </Typography>
                  {option.description && (
                    <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.25 }}>
                      {option.description}
                    </Typography>
                  )}
                </Box>
                {checkedOptions.has(option.label) && <CheckCircleOutlineIcon color='primary' fontSize='small' sx={{ ml: 1, mt: '2px', flexShrink: 0 }} />}
              </OptionButton>
            </OptionWithTooltip>
          ))}
        </FormGroup>
      )}

      {/* Freeform text input — shown for text mode, or when allowFreeform is true */}
      {!answered && (inputType === 'text' || (data.allowFreeform ?? true)) && (
        <FreeformContainer data-testid='ask-question-freeform'>
          <TextField
            size='small'
            placeholder={inputType === 'text' ? 'Type your answer...' : 'Or type a custom answer...'}
            value={freeformText}
            onChange={(event) => {
              setFreeformText(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            fullWidth
            multiline
            maxRows={3}
            data-testid='ask-question-text-input'
          />
          <Button
            variant='contained'
            size='small'
            onClick={inputType === 'multi-select' ? handleMultiSelectSubmit : handleFreeformSubmit}
            disabled={inputType === 'multi-select' ? (checkedOptions.size === 0 && !freeformText.trim()) : !freeformText.trim()}
            data-testid='ask-question-submit'
          >
            <SendIcon fontSize='small' />
          </Button>
        </FreeformContainer>
      )}

      {/* Multi-select submit button when no freeform */}
      {!answered && inputType === 'multi-select' && !(data.allowFreeform ?? true) && (
        <Box sx={{ mt: 1 }}>
          <Button
            variant='contained'
            size='small'
            onClick={handleMultiSelectSubmit}
            disabled={checkedOptions.size === 0}
            data-testid='ask-question-multiselect-submit'
          >
            Submit ({checkedOptions.size} selected)
          </Button>
        </Box>
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
