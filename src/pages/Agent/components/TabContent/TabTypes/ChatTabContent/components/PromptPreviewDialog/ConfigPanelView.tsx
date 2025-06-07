import Box from '@mui/material/Box';
import { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { debounce } from 'lodash';
import React, { useCallback, useEffect, useState } from 'react';

import { PromptConfigForm } from '../PromptConfigForm';

interface ConfigPanelViewProps {
  handlerSchema: Record<string, unknown>;
  initialHandlerConfig?: HandlerConfig;
  handleFormChange: (updatedConfig: HandlerConfig) => void;
  previewLoading: boolean;
  handlerConfigLoading: boolean;
}

/**
 * Configuration panel component with form and controls
 * Uses local state to manage form data internally without causing unnecessary rerenders
 */
export const ConfigPanelView: React.FC<ConfigPanelViewProps> = React.memo(({
  handlerSchema,
  initialHandlerConfig,
  handleFormChange,
  previewLoading,
  handlerConfigLoading,
}) => {
  // Keep form data in local state to prevent unnecessary rerenders
  const [formData, setFormData] = useState<HandlerConfig | undefined>(initialHandlerConfig);

  // Sync formData with initialHandlerConfig
  useEffect(() => {
    setFormData(initialHandlerConfig);
  }, [initialHandlerConfig]);

  // Create debounced handler for form updates
  const debouncedHandlerReference = useCallback(
    debounce((updatedConfig: HandlerConfig) => {
      handleFormChange(updatedConfig);
    }, 300),
    [handleFormChange]
  );

  // Handle form changes locally and trigger debounced update
  const handleLocalFormChange = useCallback((updatedConfig: HandlerConfig): void => {
    setFormData(updatedConfig);
    debouncedHandlerReference(updatedConfig);
  }, [debouncedHandlerReference]);

  return (
    <Box sx={{ width: '100%' }}>
      <PromptConfigForm
        schema={handlerSchema}
        formData={formData}
        onChange={handleLocalFormChange}
        disabled={previewLoading}
        loading={handlerConfigLoading}
      />
    </Box>
  );
});
