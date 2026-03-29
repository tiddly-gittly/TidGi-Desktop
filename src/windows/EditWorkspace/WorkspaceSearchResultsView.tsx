import { Divider, List, ListItem, Switch, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { IGenericSectionDefinition } from '@services/preferences/definitions/types';
import { allWorkspaceSections } from '@services/workspaces/definitions/registry';
import type { IWikiWorkspace } from '@services/workspaces/interface';
import { HighlightText } from '../Preferences/HighlightText';

const ResultsContainer = styled('div')`
  width: 100%;
  padding: 8px 0;
`;

const SectionLabel = styled(Typography)`
  color: ${({ theme }) => theme.palette.text.secondary};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 4px;
`;

const SettingRow = styled(ListItem)`
  flex-direction: row;
  align-items: flex-start;
  padding-top: 10px;
  padding-bottom: 10px;
  gap: 12px;
`;

const SettingTextBlock = styled('div')`
  flex: 1;
  min-width: 0;
`;

const SettingTitle = styled(Typography)`
  color: ${({ theme }) => theme.palette.text.primary};
  font-size: 0.9rem;
`;

const SettingDescription = styled(Typography)`
  color: ${({ theme }) => theme.palette.text.secondary};
  font-size: 0.78rem;
  margin-top: 2px;
`;

const ControlBlock = styled('div')`
  flex-shrink: 0;
  display: flex;
  align-items: center;
`;

interface WorkspaceSearchResultsViewProps {
  onNeedsRestart: () => void;
  query: string;
  workspace: IWikiWorkspace;
  workspaceSetter: (workspace: IWikiWorkspace, requestSaveAndRestart?: boolean) => void;
}

/** Build a flat list of searchable items from the section registry */
type SearchableItem = {
  fieldKey: string;
  item: { key: string; titleKey: string; descriptionKey?: string; type: string; needsRestart?: boolean };
  section: IGenericSectionDefinition;
};

function getSearchableItems(): SearchableItem[] {
  const items: SearchableItem[] = [];
  for (const section of allWorkspaceSections) {
    for (const item of section.items) {
      if ('key' in item && 'titleKey' in item && item.type.startsWith('preference-')) {
        items.push({ fieldKey: item.key, item: item as SearchableItem['item'], section });
      }
    }
  }
  return items;
}

export function WorkspaceSearchResultsView({
  query,
  workspace,
  workspaceSetter,
  onNeedsRestart,
}: WorkspaceSearchResultsViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const normalizedQuery = query.toLowerCase().trim();

  const filteredEntries = getSearchableItems().filter(({ item, section }) => {
    const title = t(item.titleKey).toLowerCase();
    const desc = item.descriptionKey ? t(item.descriptionKey).toLowerCase() : '';
    const sectionTitle = t(section.titleKey).toLowerCase();
    return title.includes(normalizedQuery) || desc.includes(normalizedQuery) || sectionTitle.includes(normalizedQuery);
  });

  if (filteredEntries.length === 0) {
    return (
      <Typography color='text.secondary' sx={{ mt: 2 }}>
        {t('Preference.SearchNoResult', { defaultValue: 'No settings found for "{{query}}"', query })}
      </Typography>
    );
  }

  return (
    <ResultsContainer>
      <List disablePadding>
        {filteredEntries.map(({ fieldKey, item, section }, index) => (
          <React.Fragment key={fieldKey}>
            {index > 0 && <Divider />}
            <SectionLabel>
              <HighlightText text={t(section.titleKey)} query={query} />
            </SectionLabel>
            {renderWorkspaceField(fieldKey, item, workspace, workspaceSetter, onNeedsRestart, query, t)}
          </React.Fragment>
        ))}
      </List>
    </ResultsContainer>
  );
}

function renderWorkspaceField(
  fieldKey: string,
  item: SearchableItem['item'],
  workspace: IWikiWorkspace,
  workspaceSetter: (workspace: IWikiWorkspace, requestSaveAndRestart?: boolean) => void,
  onNeedsRestart: () => void,
  query: string,
  t: ReturnType<typeof useTranslation>['t'],
): React.JSX.Element {
  const title = t(item.titleKey);
  const description = item.descriptionKey ? t(item.descriptionKey) : undefined;

  if (item.type === 'preference-boolean') {
    const value = (workspace as unknown as Record<string, unknown>)[fieldKey] as boolean ?? false;
    return (
      <SettingRow disablePadding key={fieldKey}>
        <SettingTextBlock>
          <SettingTitle>
            <HighlightText text={title} query={query} />
          </SettingTitle>
          {description && (
            <SettingDescription>
              <HighlightText text={description} query={query} />
            </SettingDescription>
          )}
        </SettingTextBlock>
        <ControlBlock>
          <Switch
            checked={value}
            onChange={(_, checked) => {
              workspaceSetter({ ...workspace, [fieldKey]: checked }, item.needsRestart);
              if (item.needsRestart) onNeedsRestart();
            }}
            color='primary'
            size='small'
          />
        </ControlBlock>
      </SettingRow>
    );
  }

  if (item.type === 'preference-number') {
    const value = (workspace as unknown as Record<string, unknown>)[fieldKey] as number ?? 0;
    return (
      <SettingRow disablePadding key={fieldKey}>
        <SettingTextBlock>
          <SettingTitle>
            <HighlightText text={title} query={query} />
          </SettingTitle>
          {description && (
            <SettingDescription>
              <HighlightText text={description} query={query} />
            </SettingDescription>
          )}
        </SettingTextBlock>
        <ControlBlock>
          <TextField
            type='number'
            value={value}
            onChange={(event) => {
              const number_ = Number(event.target.value);
              if (!Number.isNaN(number_)) workspaceSetter({ ...workspace, [fieldKey]: number_ });
            }}
            size='small'
            variant='outlined'
            sx={{ width: 120 }}
          />
        </ControlBlock>
      </SettingRow>
    );
  }

  // Fallback: plain string field
  const value = (workspace as unknown as Record<string, unknown>)[fieldKey] as string ?? '';
  return (
    <SettingRow disablePadding key={fieldKey}>
      <SettingTextBlock>
        <SettingTitle>
          <HighlightText text={title} query={query} />
        </SettingTitle>
        {description && (
          <SettingDescription>
            <HighlightText text={description} query={query} />
          </SettingDescription>
        )}
      </SettingTextBlock>
      <ControlBlock>
        <TextField
          value={value}
          onChange={(event) => {
            workspaceSetter({ ...workspace, [fieldKey]: event.target.value });
          }}
          size='small'
          variant='outlined'
          sx={{ minWidth: 200 }}
        />
      </ControlBlock>
    </SettingRow>
  );
}
