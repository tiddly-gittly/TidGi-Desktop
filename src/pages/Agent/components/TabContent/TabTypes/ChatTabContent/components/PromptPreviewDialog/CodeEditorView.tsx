import Editor from '@monaco-editor/react';
import { Box } from '@mui/material';
import type { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import React, { useCallback, useEffect, useState } from 'react';

interface CodeEditorViewProps {
  initialConfig?: HandlerConfig;
  onChange: (updatedConfig: HandlerConfig) => void;
  isFullScreen: boolean;
}

/**
 * JSON Code editor view for editing handler configurations JSON directly and copy & paste full config.
 */
export const CodeEditorView: React.FC<CodeEditorViewProps> = ({
  initialConfig,
  onChange,
  isFullScreen,
}) => {
  const [localConfig, setLocalConfig] = useState<HandlerConfig | undefined>(initialConfig);

  useEffect(() => {
    setLocalConfig(initialConfig);
  }, [initialConfig]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!value) return;
    try {
      const parsedConfig = JSON.parse(value) as HandlerConfig;
      setLocalConfig(parsedConfig);
      onChange(parsedConfig);
    } catch (error) {
      console.error('Invalid JSON in code editor:', error);
    }
  }, [onChange]);

  return (
    <Box
      sx={{
        height: isFullScreen ? '100%' : '60vh',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      <Editor
        height='100%'
        defaultLanguage='json'
        value={localConfig ? JSON.stringify(localConfig, null, 2) : '{}'}
        onChange={handleEditorChange}
        options={{
          minimap: { enabled: true },
          fontSize: 14,
          wordWrap: 'on',
          automaticLayout: true,
          formatOnPaste: true,
          formatOnType: true,
          scrollBeyondLastLine: false,
        }}
      />
    </Box>
  );
};
