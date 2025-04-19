import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Tab, Tabs, Typography } from '@mui/material';
import { CoreMessage } from 'ai';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

// 样式组件
const StyledPre = styled.pre`
  background-color: ${props => props.theme.palette.background.default};
  padding: 16px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  color: ${props => props.theme.palette.text.primary};
  border: 1px solid ${props => props.theme.palette.divider};
`;

const RoleTitle = styled.div`
  font-weight: bold;
  margin-bottom: 4px;
  color: ${props => props.theme.palette.primary.main};
`;

const MessageWrapper = styled.div`
  margin-bottom: 24px;
`;

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role='tabpanel'
      hidden={value !== index}
      id={`prompt-preview-tabpanel-${index}`}
      aria-labelledby={`prompt-preview-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface PromptPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  prompts: CoreMessage[];
  rawPrompts?: any;
}

export const PromptPreviewDialog: React.FC<PromptPreviewDialogProps> = ({
  open,
  onClose,
  prompts,
  rawPrompts,
}) => {
  const { t } = useTranslation('agent');
  const [tabValue, setTabValue] = React.useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth='md'
      fullWidth
      aria-labelledby='prompt-preview-dialog-title'
    >
      <DialogTitle id='prompt-preview-dialog-title'>
        {t('Chat.PromptPreview.Title', { ns: 'agent' })}
      </DialogTitle>
      <DialogContent>
        <Paper variant='outlined' sx={{ mb: 2 }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            aria-label='prompt preview tabs'
            centered
          >
            <Tab label={t('Chat.PromptPreview.ProcessedTab', { ns: 'agent' })} />
            <Tab label={t('Chat.PromptPreview.RawTab', { ns: 'agent' })} />
          </Tabs>

          {/* 处理后的提示词 */}
          <TabPanel value={tabValue} index={0}>
            <Typography variant='body2' color='textSecondary' paragraph>
              {t('Chat.PromptPreview.ProcessedDescription', { ns: 'agent' })}
            </Typography>

            {prompts.map((prompt, index) => (
              <MessageWrapper key={index}>
                <RoleTitle>{prompt.role}:</RoleTitle>
                <StyledPre>{prompt.content}</StyledPre>
              </MessageWrapper>
            ))}
          </TabPanel>

          {/* 原始提示词配置 */}
          <TabPanel value={tabValue} index={1}>
            <Typography variant='body2' color='textSecondary' paragraph>
              {t('Chat.PromptPreview.RawDescription', { ns: 'agent' })}
            </Typography>

            <StyledPre>
              {JSON.stringify(rawPrompts, null, 2)}
            </StyledPre>
          </TabPanel>
        </Paper>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color='primary'>
          {t('Chat.PromptPreview.Close', { ns: 'agent' })}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
