// Model parameters dialog component

import { ModelParametersDialog as BaseModelParametersDialog } from '@/pages/Preferences/sections/ExternalAPI/components/ModelParametersDialog';
import { AiAPIConfig } from '@services/agentInstance/buildInAgentHandlers/promptConcatUtils/promptConcatSchema';
import React from 'react';

interface ModelParametersDialogProps {
  open: boolean;
  onClose: () => void;
  config: AiAPIConfig | null;
  onSave: (newConfig: AiAPIConfig) => Promise<void>;
}

/**
 * Dialog for editing model parameters
 * This is a wrapper around the ModelParametersDialog from Preferences
 */
export const ModelParametersDialog: React.FC<ModelParametersDialogProps> = ({
  open,
  onClose,
  config,
  onSave,
}) => {
  // No need for translation as we're reusing the component
  // Re-use the ModelParametersDialog from Preferences
  return (
    <BaseModelParametersDialog
      open={open}
      onClose={onClose}
      config={config}
      onSave={onSave}
    />
  );
};
