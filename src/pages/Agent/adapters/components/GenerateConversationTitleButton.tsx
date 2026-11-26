import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { IconButton, Snackbar, Tooltip } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function GenerateConversationTitleButton({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const { t } = useTranslation('agent');
  const [generating, setGenerating] = useState(false);
  const [showError, setShowError] = useState(false);
  const label = t('Agent.GenerateTitle');

  const generate = async () => {
    setGenerating(true);
    setShowError(false);
    try {
      await window.service.agentInstance.regenerateConversationTitle(conversationId);
    } catch {
      setShowError(true);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Tooltip title={label}>
        <span>
          <IconButton aria-label={label} size='small' disabled={disabled} loading={generating} onClick={() => void generate()}>
            <AutoAwesomeIcon fontSize='small' />
          </IconButton>
        </span>
      </Tooltip>
      <Snackbar
        open={showError}
        onClose={() => {
          setShowError(false);
        }}
        message={t('Agent.GenerateTitleError')}
      />
    </>
  );
}
