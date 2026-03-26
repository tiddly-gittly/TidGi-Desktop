import { Divider, List, ListItem, MenuItem, Select, Switch, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { TFunction } from 'i18next';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { IPreferences } from '@services/preferences/interface';
import { ISettingPropertySchema, preferencesSchema, sectionTitleKeys } from '@services/preferences/settingsSchema';
import { HighlightText } from './HighlightText';

/** Helper to call t() with an optional namespace without fighting the type overloads */
function tx(t: TFunction<['translation', 'agent']>, key: string, ns?: string): string {
  return ns ? (t as (k: string, o: { ns: string }) => string)(key, { ns }) : (t as (k: string) => string)(key);
}

const ResultsContainer = styled('div')`
  width: 100%;
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

interface PreferenceSearchResultsViewProps {
  onNeedsRestart: () => void;
  preferences: IPreferences;
  query: string;
}

/** Inline renderer for a single boolean preference field */
function BooleanField({ preferenceKey, schema, preferences, query, onNeedsRestart }: {
  onNeedsRestart: () => void;
  preferences: IPreferences;
  preferenceKey: keyof IPreferences;
  query: string;
  schema: ISettingPropertySchema;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = preferences[preferenceKey] as boolean;
  const title = tx(t, schema['x-titleKey'], schema['x-ns']);
  const description = schema['x-descriptionKey'] ? tx(t, schema['x-descriptionKey'], schema['x-ns']) : undefined;

  const handleChange = useCallback(async (checked: boolean) => {
    await window.service.preference.set(preferenceKey, checked);
    if (schema['x-needsRestart']) onNeedsRestart();
    if (schema['x-sideEffect'] === 'realignActiveWorkspace') {
      await window.service.workspaceView.realignActiveWorkspace();
    }
  }, [onNeedsRestart, preferenceKey, schema]);

  return (
    <SettingRow disablePadding>
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
            void handleChange(checked);
          }}
          color='primary'
          size='small'
        />
      </ControlBlock>
    </SettingRow>
  );
}

/** Inline renderer for enum preference field */
function EnumField({ preferenceKey, schema, preferences, query, onNeedsRestart }: {
  onNeedsRestart: () => void;
  preferences: IPreferences;
  preferenceKey: keyof IPreferences;
  query: string;
  schema: ISettingPropertySchema;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = preferences[preferenceKey] as string;
  const title = tx(t, schema['x-titleKey'], schema['x-ns']);
  const description = schema['x-descriptionKey'] ? tx(t, schema['x-descriptionKey'], schema['x-ns']) : undefined;
  const enumValues = schema.enum ?? [];
  const enumNames = schema.enumNames ?? enumValues;

  const handleChange = useCallback(async (newValue: string) => {
    // Type cast is safe because enum values are validated against the schema
    await window.service.preference.set(preferenceKey, newValue as IPreferences[typeof preferenceKey]);
    if (schema['x-needsRestart']) onNeedsRestart();
  }, [onNeedsRestart, preferenceKey, schema]);

  return (
    <SettingRow disablePadding>
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
            void handleChange(event.target.value);
          }}
          size='small'
          variant='outlined'
          sx={{ minWidth: 140 }}
        >
          {enumValues.map((v, index) => (
            <MenuItem key={v} value={v}>
              {t(enumNames[index] ?? v)}
            </MenuItem>
          ))}
        </Select>
      </ControlBlock>
    </SettingRow>
  );
}

/** Inline renderer for number preference field */
function NumberField({ preferenceKey, schema, preferences, query, onNeedsRestart }: {
  onNeedsRestart: () => void;
  preferences: IPreferences;
  preferenceKey: keyof IPreferences;
  query: string;
  schema: ISettingPropertySchema;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = preferences[preferenceKey] as number;
  const title = tx(t, schema['x-titleKey'], schema['x-ns']);
  const description = schema['x-descriptionKey'] ? tx(t, schema['x-descriptionKey'], schema['x-ns']) : undefined;

  const handleChange = useCallback(async (newValue: number) => {
    if (!Number.isNaN(newValue)) {
      await window.service.preference.set(preferenceKey, newValue as IPreferences[typeof preferenceKey]);
      if (schema['x-needsRestart']) onNeedsRestart();
    }
  }, [onNeedsRestart, preferenceKey, schema]);

  return (
    <SettingRow disablePadding>
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
            void handleChange(Number(event.target.value));
          }}
          size='small'
          variant='outlined'
          sx={{ width: 120 }}
        />
      </ControlBlock>
    </SettingRow>
  );
}

/** Entry point: filters schema by query and renders matching items as flat editable list */
export function PreferenceSearchResultsView({ query, preferences, onNeedsRestart }: PreferenceSearchResultsViewProps): React.JSX.Element {
  const { t } = useTranslation();

  const normalizedQuery = query.toLowerCase().trim();

  type ResultEntry = {
    key: keyof IPreferences;
    schema: ISettingPropertySchema;
  };

  const filteredEntries: ResultEntry[] = Object.entries(preferencesSchema.properties)
    .filter(([, propertySchema]) => {
      if (!propertySchema['x-titleKey']) return false;
      const title = tx(t, propertySchema['x-titleKey'], propertySchema['x-ns']).toLowerCase();
      const desc = propertySchema['x-descriptionKey'] ? tx(t, propertySchema['x-descriptionKey'], propertySchema['x-ns']).toLowerCase() : '';
      const sectionInfo = sectionTitleKeys[propertySchema['x-section']];
      const sectionTitle = t(sectionInfo.key, sectionInfo.ns ? { ns: sectionInfo.ns } : undefined).toLowerCase();
      return title.includes(normalizedQuery) || desc.includes(normalizedQuery) || sectionTitle.includes(normalizedQuery);
    })
    .map(([key, schema]) => ({ key: key as keyof IPreferences, schema }));

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
        {filteredEntries.map(({ key, schema }, index) => {
          const sectionInfo = sectionTitleKeys[schema['x-section']];
          const sectionTitle = t(sectionInfo.key, sectionInfo.ns ? { ns: sectionInfo.ns } : undefined);

          return (
            <React.Fragment key={key}>
              {index > 0 && <Divider />}
              <SectionLabel>
                <HighlightText text={sectionTitle} query={query} />
              </SectionLabel>
              {renderField(key, schema, preferences, query, onNeedsRestart, t)}
            </React.Fragment>
          );
        })}
      </List>
    </ResultsContainer>
  );
}

function renderField(
  key: keyof IPreferences,
  schema: ISettingPropertySchema,
  preferences: IPreferences,
  query: string,
  onNeedsRestart: () => void,
  t: ReturnType<typeof useTranslation>['t'],
): React.JSX.Element {
  if (!schema.inlineEditable) {
    // For non-inline-editable fields, show a read-only row pointing user to the section
    const title = tx(t, schema['x-titleKey'], schema['x-ns']);
    return (
      <SettingRow disablePadding key={key}>
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
    return (
      <BooleanField
        key={key}
        preferenceKey={key}
        schema={schema}
        preferences={preferences}
        query={query}
        onNeedsRestart={onNeedsRestart}
      />
    );
  }

  if (schema.type === 'string' && schema.enum) {
    return (
      <EnumField
        key={key}
        preferenceKey={key}
        schema={schema}
        preferences={preferences}
        query={query}
        onNeedsRestart={onNeedsRestart}
      />
    );
  }

  if (schema.type === 'number') {
    return (
      <NumberField
        key={key}
        preferenceKey={key}
        schema={schema}
        preferences={preferences}
        query={query}
        onNeedsRestart={onNeedsRestart}
      />
    );
  }

  // Fallback: string field without enum
  const title = tx(t, schema['x-titleKey'], schema['x-ns']);
  const description = schema['x-descriptionKey'] ? tx(t, schema['x-descriptionKey'], schema['x-ns']) : undefined;
  const value = preferences[key] as string;

  return (
    <SettingRow disablePadding key={key}>
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
          value={value ?? ''}
          onChange={async (event) => {
            await window.service.preference.set(key, event.target.value as IPreferences[typeof key]);
          }}
          size='small'
          variant='outlined'
          sx={{ minWidth: 200 }}
        />
      </ControlBlock>
    </SettingRow>
  );
}
