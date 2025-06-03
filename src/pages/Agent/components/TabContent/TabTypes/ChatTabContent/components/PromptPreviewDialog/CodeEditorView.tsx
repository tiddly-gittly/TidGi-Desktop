import Editor from '@monaco-editor/react';
import { Box } from '@mui/material';
import type { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import React from 'react';

interface CodeEditorViewProps {
  handlerConfig?: HandlerConfig;
  onChange: (updatedConfig: HandlerConfig) => void;
  isFullScreen: boolean;
}

/**
 * JSON代码编辑器组件，使用Monaco编辑器进行JSON配置的高级编辑
 */
export const CodeEditorView: React.FC<CodeEditorViewProps> = React.memo(({
  handlerConfig,
  onChange,
  isFullScreen,
}) => {
  // 处理代码编辑器内容变化
  const handleEditorChange = (value: string | undefined) => {
    if (!value) return;

    try {
      // 尝试解析JSON
      const parsedConfig = JSON.parse(value);
      onChange(parsedConfig);
    } catch (error) {
      // JSON解析错误时不更新配置
      console.error('Invalid JSON in code editor:', error);
    }
  };

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
        value={handlerConfig ? JSON.stringify(handlerConfig, null, 2) : '{}'}
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
});
