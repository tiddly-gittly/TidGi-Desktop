import { Divider, List, ListItem, MenuItem, Select, Switch, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { IWikiWorkspace } from '@services/workspaces/interface';
import { IWorkspaceSettingPropertySchema, workspaceSectionTitleKeys, workspaceSettingsSchema } from '@services/workspaces/workspaceSettingsSchema';
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

type WorkspaceFieldKey = keyof typeof workspaceSettingsSchema;

interface WorkspaceSearchResultsViewProps {
  onNeedsRestart: () => void;
  query: string;
  workspace: IWikiWorkspace;
  workspaceSetter: (workspace: IWikiWorkspace, requestSaveAndRestart?: boolean) => void;
}

export function WorkspaceSearchResultsView({
  query,
  workspace,
  workspaceSetter,
  onNeedsRestart,
}: WorkspaceSearchResultsViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const normalizedQuery = query.toLowerCase().trim();

  type ResultEntry = { fieldKey: WorkspaceFieldKey; schema: IWorkspaceSettingPropertySchema };
  const filteredEntries: ResultEntry[] = (Object.entries(workspaceSettingsSchema) as [WorkspaceFieldKey, IWorkspaceSettingPropertySchema][])
    .filter(([, schema]) => {
      const title = t(schema.titleKey).toLowerCase();
      const desc = schema.descriptionKey ? t(schema.descriptionKey).toLowerCase() : '';
      const section = t(workspaceSectionTitleKeys[schema.section]).toLowerCase();
      return title.includes(normalizedQuery) || desc.includes(normalizedQuery) || section.includes(normalizedQuery);
    })
    .map(([fieldKey, schema]) => ({ fieldKey, schema }));

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
        {filteredEntries.map(({ fieldKey, schema }, index) => (
          <React.Fragment key={fieldKey}>
            {index > 0 && <Divider />}
            <SectionLabel>
              <HighlightText text={t(workspaceSectionTitleKeys[schema.section])} query={query} />
            </SectionLabel>
            {renderWorkspaceField(fieldKey, schema, workspace, workspaceSetter, onNeedsRestart, query, t)}
          </React.Fragment>
        ))}
      </List>
    </ResultsContainer>
  );
}

function renderWorkspaceField(
  fieldKey: WorkspaceFieldKey,
  schema: IWorkspaceSettingPropertySchema,
  workspace: IWikiWorkspace,
  workspaceSetter: (workspace: IWikiWorkspace, requestSaveAndRestart?: boolean) => void,
  onNeedsRestart: () => void,
  query: string,
  t: ReturnType<typeof useTranslation>['t'],
): React.JSX.Element {
  const title = t(schema.titleKey);
  const description = schema.descriptionKey ? t(schema.descriptionKey) : undefined;

  if (!schema.inlineEditable) {
    return (
      <SettingRow disablePadding key={fieldKey}>
        <SettingTextBlock>
          <SettingTitle>
            <HighlightText text={title} query={query} />
          </SettingTitle>
          <SettingDescription>
            <HighlightText text={t('Preference.SearchOpenSection', { defaultValue: 'Open the section below to edit this setting' })} query='' />
          </SettingDescription>
        </SettingTextBlock>
      </SettingRow>
    );
  }

  if (schema.type === 'boolean') {
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
              workspaceSetter({ ...workspace, [fieldKey]: checked }, schema.needsRestart);
              if (schema.needsRestart) onNeedsRestart();
            }}
            color='primary'
            size='small'
          />
        </ControlBlock>
      </SettingRow>
    );
  }

  if (schema.type === 'string' && schema.enum) {
    const value = (workspace as unknown as Record<string, unknown>)[fieldKey] as string ?? '';
    const enumNames = schema.enumNames ?? schema.enum;
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
          <Select
            value={value}
            onChange={(event) => {
              workspaceSetter({ ...workspace, [fieldKey]: event.target.value });
            }}
            size='small'
            variant='outlined'
            sx={{ minWidth: 140 }}
          >
            {schema.enum.map((v, index) => <MenuItem key={v} value={v}>{t(enumNames[index] ?? v)}</MenuItem>)}
          </Select>
        </ControlBlock>
      </SettingRow>
    );
  }

  if (schema.type === 'number') {
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
