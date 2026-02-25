/**
 * Tool Approval & Timeout Settings Modal
 *
 * Opened from the AI Agent section in Preferences.
 * Allows configuring:
 * - Global default timeout for tool execution
 * - Per-tool approval mode (auto / confirm)
 * - Allow/deny regex patterns per tool
 * - Per-tool timeout overrides
 * - API retry configuration
 */
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Represents a single tool's approval/timeout config in the settings */
interface ToolRuleConfig {
  toolId: string;
  mode: 'auto' | 'confirm';
  timeoutMs: number;
  allowPatterns: string[];
  denyPatterns: string[];
}

interface ToolApprovalSettings {
  globalTimeoutMs: number;
  retryMaxAttempts: number;
  retryInitialDelayMs: number;
  toolRules: ToolRuleConfig[];
}

const DEFAULT_SETTINGS: ToolApprovalSettings = {
  globalTimeoutMs: 30000,
  retryMaxAttempts: 3,
  retryInitialDelayMs: 1000,
  toolRules: [],
};

/** Known tool IDs for the dropdown */
const KNOWN_TOOL_IDS = [
  'wiki-search',
  'wiki-operation',
  'wiki-backlinks',
  'wiki-toc',
  'wiki-recent',
  'wiki-list-tiddlers',
  'wiki-get-errors',
  'wiki-update-embeddings',
  'zx-script',
  'web-fetch',
  'spawn-agent',
  'alarm-clock',
  'ask-question',
  'summary',
  'git-search-commits',
  'git-read-commit-file',
];

interface ToolApprovalSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ToolApprovalSettingsDialog({ open, onClose }: ToolApprovalSettingsDialogProps): React.JSX.Element {
  const { t } = useTranslation('agent');
  const [settings, setSettings] = useState<ToolApprovalSettings>(DEFAULT_SETTINGS);
  const [newPatternText, setNewPatternText] = useState('');
  const [editingToolIndex, setEditingToolIndex] = useState<number | null>(null);
  const [patternType, setPatternType] = useState<'allow' | 'deny'>('allow');

  // Load settings on open
  useEffect(() => {
    if (!open) return;
    const loadSettings = async () => {
      try {
        // TODO: Load from preference service once the key is registered
        // const saved = await window.service.preference.get('toolApprovalSettings');
        // if (saved) setSettings(saved);
      } catch {
        // Use defaults
      }
    };
    void loadSettings();
  }, [open]);

  const handleSave = useCallback(async () => {
    try {
      // TODO: Save to preference service once the key is registered
      // await window.service.preference.set('toolApprovalSettings', settings);
      onClose();
    } catch (error) {
      void window.service.native.log('error', 'ToolApprovalSettings: save failed', { error });
    }
  }, [settings, onClose]);

  const addToolRule = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      toolRules: [...prev.toolRules, {
        toolId: KNOWN_TOOL_IDS[0],
        mode: 'auto',
        timeoutMs: 0,
        allowPatterns: [],
        denyPatterns: [],
      }],
    }));
    setEditingToolIndex(settings.toolRules.length);
  }, [settings.toolRules.length]);

  const removeToolRule = useCallback((index: number) => {
    setSettings(prev => ({
      ...prev,
      toolRules: prev.toolRules.filter((_, i) => i !== index),
    }));
    if (editingToolIndex === index) setEditingToolIndex(null);
  }, [editingToolIndex]);

  const updateToolRule = useCallback((index: number, partial: Partial<ToolRuleConfig>) => {
    setSettings(prev => ({
      ...prev,
      toolRules: prev.toolRules.map((rule, i) => i === index ? { ...rule, ...partial } : rule),
    }));
  }, []);

  const addPattern = useCallback(() => {
    if (!newPatternText.trim() || editingToolIndex === null) return;
    const field = patternType === 'allow' ? 'allowPatterns' : 'denyPatterns';
    updateToolRule(editingToolIndex, {
      [field]: [...settings.toolRules[editingToolIndex][field], newPatternText.trim()],
    });
    setNewPatternText('');
  }, [newPatternText, editingToolIndex, patternType, settings.toolRules, updateToolRule]);

  const removePattern = useCallback((toolIndex: number, type: 'allow' | 'deny', patternIndex: number) => {
    const field = type === 'allow' ? 'allowPatterns' : 'denyPatterns';
    updateToolRule(toolIndex, {
      [field]: settings.toolRules[toolIndex][field].filter((_, i) => i !== patternIndex),
    });
  }, [settings.toolRules, updateToolRule]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>Tool Approval & Timeout Settings</DialogTitle>
      <DialogContent>
        {/* Global Settings */}
        <Typography variant='subtitle1' sx={{ mt: 1, mb: 1 }}>Global Settings</Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label='Global Timeout (ms)'
            type='number'
            size='small'
            value={settings.globalTimeoutMs}
            onChange={(e) => setSettings(prev => ({ ...prev, globalTimeoutMs: Number(e.target.value) }))}
            helperText='Default timeout for all tool executions. 0 = no timeout.'
            sx={{ flex: 1 }}
          />
        </Box>

        {/* API Retry Settings */}
        <Typography variant='subtitle1' sx={{ mb: 1 }}>API Retry (Exponential Backoff)</Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label='Max Attempts'
            type='number'
            size='small'
            value={settings.retryMaxAttempts}
            onChange={(e) => setSettings(prev => ({ ...prev, retryMaxAttempts: Number(e.target.value) }))}
            helperText='0 = no retry'
            sx={{ flex: 1 }}
          />
          <TextField
            label='Initial Delay (ms)'
            type='number'
            size='small'
            value={settings.retryInitialDelayMs}
            onChange={(e) => setSettings(prev => ({ ...prev, retryInitialDelayMs: Number(e.target.value) }))}
            helperText='First retry delay, doubled each attempt'
            sx={{ flex: 1 }}
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Per-Tool Rules */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant='subtitle1'>Per-Tool Rules</Typography>
          <Button startIcon={<AddIcon />} size='small' onClick={addToolRule}>Add Rule</Button>
        </Box>

        {settings.toolRules.length === 0 && (
          <Typography variant='body2' color='text.secondary'>
            No per-tool rules configured. All tools use the global timeout and auto-approval.
          </Typography>
        )}

        {settings.toolRules.map((rule, index) => (
          <Box
            key={index}
            sx={{
              border: '1px solid',
              borderColor: editingToolIndex === index ? 'primary.main' : 'divider',
              borderRadius: 1,
              p: 1.5,
              mb: 1,
              cursor: 'pointer',
            }}
            onClick={() => setEditingToolIndex(index)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <FormControl size='small' sx={{ minWidth: 200 }}>
                <InputLabel>Tool</InputLabel>
                <Select
                  value={rule.toolId}
                  label='Tool'
                  onChange={(e) => updateToolRule(index, { toolId: e.target.value })}
                >
                  {KNOWN_TOOL_IDS.map(id => <MenuItem key={id} value={id}>{id}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControlLabel
                control={
                  <Switch
                    checked={rule.mode === 'confirm'}
                    onChange={(e) => updateToolRule(index, { mode: e.target.checked ? 'confirm' : 'auto' })}
                  />
                }
                label='Require approval'
              />

              <TextField
                label='Timeout (ms)'
                type='number'
                size='small'
                value={rule.timeoutMs}
                onChange={(e) => updateToolRule(index, { timeoutMs: Number(e.target.value) })}
                sx={{ width: 130 }}
              />

              <IconButton
                size='small'
                color='error'
                onClick={(e) => {
                  e.stopPropagation();
                  removeToolRule(index);
                }}
              >
                <DeleteIcon fontSize='small' />
              </IconButton>
            </Box>

            {/* Pattern editing (only when selected) */}
            {editingToolIndex === index && (
              <Box sx={{ mt: 1 }}>
                <Typography variant='caption' color='text.secondary'>
                  Patterns: deny patterns block execution, allow patterns skip approval.
                </Typography>

                {/* Existing patterns */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {rule.denyPatterns.map((p, pi) => (
                    <Chip
                      key={`deny-${pi}`}
                      label={p}
                      color='error'
                      size='small'
                      variant='outlined'
                      onDelete={() => removePattern(index, 'deny', pi)}
                    />
                  ))}
                  {rule.allowPatterns.map((p, pi) => (
                    <Chip
                      key={`allow-${pi}`}
                      label={p}
                      color='success'
                      size='small'
                      variant='outlined'
                      onDelete={() => removePattern(index, 'allow', pi)}
                    />
                  ))}
                </Box>

                {/* Add pattern */}
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <FormControl size='small' sx={{ minWidth: 100 }}>
                    <Select value={patternType} onChange={(e) => setPatternType(e.target.value as 'allow' | 'deny')}>
                      <MenuItem value='allow'>Allow</MenuItem>
                      <MenuItem value='deny'>Deny</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    size='small'
                    placeholder='Regex pattern...'
                    value={newPatternText}
                    onChange={(e) => setNewPatternText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addPattern();
                    }}
                    sx={{ flex: 1 }}
                  />
                  <Button size='small' onClick={addPattern} disabled={!newPatternText.trim()}>Add</Button>
                </Box>
              </Box>
            )}
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant='contained'>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
