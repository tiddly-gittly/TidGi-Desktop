import Box from '@mui/material/Box';
import { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { debounce } from 'lodash';
import React, { useCallback, useEffect, useState } from 'react';

import { PromptConfigForm } from '../PromptConfigForm';

interface ConfigPanelViewProps {
  handlerSchema: Record<string, unknown>;
  initialConfig?: HandlerConfig;
  handleFormChange: (updatedConfig: HandlerConfig) => void;
  handlerConfigLoading: boolean;
}

/**
 * Configuration panel component with form and controls
 * Uses local state to manage form data internally without causing unnecessary rerenders
 */
export const ConfigPanelView: React.FC<ConfigPanelViewProps> = ({
  handlerSchema,
  initialConfig,
  handleFormChange,
  handlerConfigLoading,
}) => {
  // Keep form data in local state to prevent unnecessary rerenders
  const [formData, setFormData] = useState<HandlerConfig | undefined>(initialConfig);
  // DEBUG: console initialConfig
  console.log(`initialConfig`, initialConfig);
  // DEBUG: console formData
  console.log(`formData`, formData);

  // initialize formData if it hasn't (previous one is undefined)
  useEffect(() => {
    if (formData === undefined && formData !== initialConfig) {
      setFormData(initialConfig);
    }
  }, [initialConfig]);

  // Create debounced handler for form updates
  const debouncedHandlerReference = useCallback(
    debounce((updatedConfig: HandlerConfig) => {
      handleFormChange(updatedConfig);
    }, 300),
    [handleFormChange],
  );

  // Handle form changes locally and trigger debounced update
  const handleLocalFormChange = useCallback((updatedConfig: HandlerConfig): void => {
    debouncedHandlerReference(updatedConfig);
  }, [debouncedHandlerReference]);

  return (
    <Box sx={{ width: '100%' }}>
      <PromptConfigForm
        schema={handlerSchema}
        formData={formData}
        onChange={handleLocalFormChange}
        loading={handlerConfigLoading}
      />
    </Box>
  );
};
