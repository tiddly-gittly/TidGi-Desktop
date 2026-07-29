import { Box, Tab, Tabs } from '@mui/material';
import React, { useEffect, useMemo, useState } from 'react';

export interface IKeyValueTab {
  disabled?: boolean;
  key: string;
  label: React.ReactNode;
  panel: React.ReactNode;
}

interface IKeyValueTabsProps {
  ariaLabel: string;
  onSelectedKeyChange?: (key: string) => void;
  selectedKey?: string;
  tabs: IKeyValueTab[];
  testId?: string;
}

/**
 * Shared vertical-tabs layout for editing keyed configuration records.
 * The key identifies an entry and the panel edits that key's value.
 */
export function KeyValueTabs({ ariaLabel, onSelectedKeyChange, selectedKey: controlledSelectedKey, tabs, testId }: IKeyValueTabsProps): React.JSX.Element {
  const tabKeys = useMemo(() => tabs.map(tab => tab.key), [tabs]);
  const [internalSelectedKey, setInternalSelectedKey] = useState(tabKeys[0] ?? '');
  const selectedKey = controlledSelectedKey ?? internalSelectedKey;

  useEffect(() => {
    if (!tabKeys.includes(selectedKey)) {
      const nextKey = tabKeys[0] ?? '';
      setInternalSelectedKey(nextKey);
      onSelectedKeyChange?.(nextKey);
    }
  }, [onSelectedKeyChange, selectedKey, tabKeys]);

  if (tabs.length === 0) {
    return <Box data-testid={testId} />;
  }

  return (
    <Box
      data-testid={testId}
      sx={{ flexGrow: 1, bgcolor: 'background.paper', display: 'flex', width: '100%', marginTop: 2 }}
    >
      <Tabs
        orientation='vertical'
        variant='scrollable'
        value={selectedKey}
        onChange={(_event, value: string) => {
          setInternalSelectedKey(value);
          onSelectedKeyChange?.(value);
        }}
        aria-label={ariaLabel}
        sx={{
          borderRight: 1,
          borderColor: 'divider',
          minWidth: 140,
          '& .MuiTab-root': { alignItems: 'flex-start', textAlign: 'left', paddingLeft: 2 },
        }}
      >
        {tabs.map(tab => (
          <Tab
            key={tab.key}
            value={tab.key}
            label={tab.label}
            disabled={tab.disabled}
            id={`key-value-tab-${tab.key}`}
            aria-controls={`key-value-tabpanel-${tab.key}`}
          />
        ))}
      </Tabs>
      {tabs.map(tab => (
        <div
          key={tab.key}
          role='tabpanel'
          hidden={selectedKey !== tab.key}
          id={`key-value-tabpanel-${tab.key}`}
          aria-labelledby={`key-value-tab-${tab.key}`}
          style={{ width: '100%', padding: '16px' }}
        >
          {selectedKey === tab.key && <Box>{tab.panel}</Box>}
        </div>
      ))}
    </Box>
  );
}
