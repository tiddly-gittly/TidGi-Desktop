import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SecurityIcon from '@mui/icons-material/Security';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { IToolPermissionEntry } from '@/services/toolPermissions/interface';

interface ToolPermissionsDialogProps {
  open: boolean;
  onClose: () => void;
}

const KNOWN_TOOLS = [
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

export function ToolPermissionsDialog({
  open,
  onClose,
}: ToolPermissionsDialogProps): React.JSX.Element {
  const { t } = useTranslation('agent');
  const [permissions, setPermissions] = useState<IToolPermissionEntry[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEntry, setNewEntry] = useState<{
    toolName: string;
    listType: 'blacklist' | 'whitelist';
    pattern: string;
    note: string;
  }>({
    toolName: KNOWN_TOOLS[0],
    listType: 'whitelist',
    pattern: '',
    note: '',
  });

  const loadPermissions = useCallback(async () => {
    try {
      const data = await window.service.toolPermissions.getPermissions();
      setPermissions(data);
    } catch (error) {
      void window.service.native.log('error', 'ToolPermissions: load failed', {
        error,
      });
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadPermissions();
    }
  }, [open, loadPermissions]);

  const handleAdd = useCallback(async () => {
    try {
      await window.service.toolPermissions.addPermission({
        toolName: newEntry.toolName,
        listType: newEntry.listType,
        pattern: newEntry.pattern || undefined,
        note: newEntry.note || undefined,
      });
      setAddDialogOpen(false);
      setNewEntry({
        toolName: KNOWN_TOOLS[0],
        listType: 'whitelist',
        pattern: '',
        note: '',
      });
      void loadPermissions();
    } catch (error) {
      void window.service.native.log('error', 'ToolPermissions: add failed', {
        error,
      });
    }
  }, [newEntry, loadPermissions]);

  const handleRemove = useCallback(
    async (toolName: string, listType: 'blacklist' | 'whitelist') => {
      try {
        await window.service.toolPermissions.removePermission(
          toolName,
          listType,
        );
        void loadPermissions();
      } catch (error) {
        void window.service.native.log(
          'error',
          'ToolPermissions: remove failed',
          { error },
        );
      }
    },
    [loadPermissions],
  );

  const handleClearList = useCallback(
    async (listType: 'blacklist' | 'whitelist') => {
      try {
        await window.service.toolPermissions.clearList(listType);
        void loadPermissions();
      } catch (error) {
        void window.service.native.log(
          'error',
          'ToolPermissions: clear failed',
          { error },
        );
      }
    },
    [loadPermissions],
  );

  const blacklist = permissions.filter((p) => p.listType === 'blacklist');
  const whitelist = permissions.filter((p) => p.listType === 'whitelist');

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SecurityIcon />
            Tool Permissions Management
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            Control which tools can be executed by agents. Blacklist blocks tools, whitelist allows them.
          </Typography>

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 1,
            }}
          >
            <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
              Blacklist ({blacklist.length})
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size='small'
                startIcon={<AddIcon />}
                onClick={() => {
                  setNewEntry((prev) => ({ ...prev, listType: 'blacklist' }));
                  setAddDialogOpen(true);
                }}
              >
                Add
              </Button>
              <Button
                size='small'
                color='error'
                onClick={() => {
                  void handleClearList('blacklist');
                }}
                disabled={blacklist.length === 0}
              >
                Clear All
              </Button>
            </Box>
          </Box>

          {blacklist.length === 0
            ? (
              <Typography
                variant='body2'
                color='text.secondary'
                sx={{ mb: 2, fontStyle: 'italic' }}
              >
                No blacklisted tools
              </Typography>
            )
            : (
              <Table size='small' sx={{ mb: 2 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Tool</TableCell>
                    <TableCell>Pattern</TableCell>
                    <TableCell>Note</TableCell>
                    <TableCell>Added</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {blacklist.map((entry, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Chip
                          label={entry.toolName}
                          size='small'
                          color='error'
                          variant='outlined'
                        />
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant='caption'
                          sx={{ fontFamily: 'monospace' }}
                        >
                          {entry.pattern || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant='caption'>
                          {entry.note || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant='caption'>
                          {new Date(entry.addedAt).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Tooltip title='Remove'>
                          <IconButton
                            size='small'
                            onClick={() => {
                              void handleRemove(entry.toolName, 'blacklist');
                            }}
                          >
                            <DeleteIcon fontSize='small' />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 1,
            }}
          >
            <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
              Whitelist ({whitelist.length})
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size='small'
                startIcon={<AddIcon />}
                onClick={() => {
                  setNewEntry((prev) => ({ ...prev, listType: 'whitelist' }));
                  setAddDialogOpen(true);
                }}
              >
                Add
              </Button>
              <Button
                size='small'
                color='error'
                onClick={() => {
                  void handleClearList('whitelist');
                }}
                disabled={whitelist.length === 0}
              >
                Clear All
              </Button>
            </Box>
          </Box>

          {whitelist.length === 0
            ? (
              <Typography
                variant='body2'
                color='text.secondary'
                sx={{ fontStyle: 'italic' }}
              >
                No whitelisted tools
              </Typography>
            )
            : (
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>Tool</TableCell>
                    <TableCell>Pattern</TableCell>
                    <TableCell>Note</TableCell>
                    <TableCell>Added</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {whitelist.map((entry, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Chip
                          label={entry.toolName}
                          size='small'
                          color='success'
                          variant='outlined'
                        />
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant='caption'
                          sx={{ fontFamily: 'monospace' }}
                        >
                          {entry.pattern || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant='caption'>
                          {entry.note || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant='caption'>
                          {new Date(entry.addedAt).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Tooltip title='Remove'>
                          <IconButton
                            size='small'
                            onClick={() => {
                              void handleRemove(entry.toolName, 'whitelist');
                            }}
                          >
                            <DeleteIcon fontSize='small' />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={addDialogOpen}
        onClose={() => {
          setAddDialogOpen(false);
        }}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>Add Tool Permission</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            select
            label='Tool'
            margin='dense'
            value={newEntry.toolName}
            onChange={(event) => {
              setNewEntry((prev) => ({
                ...prev,
                toolName: event.target.value,
              }));
            }}
          >
            {KNOWN_TOOLS.map((tool) => (
              <MenuItem key={tool} value={tool}>
                {tool}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            fullWidth
            label='Pattern (optional regex)'
            margin='dense'
            value={newEntry.pattern}
            onChange={(event) => {
              setNewEntry((prev) => ({ ...prev, pattern: event.target.value }));
            }}
            helperText='Leave empty to match all parameters, or provide a regex pattern'
          />

          <TextField
            fullWidth
            label='Note (optional)'
            margin='dense'
            multiline
            minRows={2}
            value={newEntry.note}
            onChange={(event) => {
              setNewEntry((prev) => ({ ...prev, note: event.target.value }));
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAddDialogOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleAdd} variant='contained'>
            Add to {newEntry.listType}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
