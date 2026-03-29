import { Divider, List, ListItem, MenuItem, Select, Switch, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { allSections, isPreferenceItem, type PreferenceItem } from '@services/preferences/definitions/registry';
import { getSideEffect } from '@services/preferences/definitions/sideEffects';
import type { IActionItem, PreferenceItemDefinition } from '@services/preferences/definitions/types';
import type { IPreferences } from '@services/preferences/interface';
import { HighlightText } from './HighlightText';

/** Helper to call t() with an optional namespace without fighting the type overloads */
function tx(t: TFunction<['translation', 'agent']>, key: string, ns?: string): string {
  return ns ? (t as (k: string, o: { ns: string }) => string)(key, { ns }) : (t as (k: string) => string)(key);
}

/**
 * Get the English translation for a key regardless of the current language.
 * Since 'en' is the fallback lng it is always loaded; `i18next.t(..., { lng: 'en' })`
 * overrides the active language for that single call.
 */
function txEn(key: string, ns?: string): string {
  try {
    return ns
      ? (i18next.t(key, { lng: 'en', ns }))
      : (i18next.t(key, { lng: 'en' }));
  } catch {
    return '';
  }
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

// ─── Search result type ──────────────────────────────────────────────

interface ISearchHit {
  item: PreferenceItemDefinition;
  sectionId: string;
  sectionTitleKey: string;
  sectionNs?: string;
}

function collectSearchHits(query: string, t: TFunction<['translation', 'agent']>): ISearchHit[] {
  const normalizedQuery = query.toLowerCase().trim();
  const hits: ISearchHit[] = [];

  for (const section of allSections) {
    const sectionTitle = tx(t, section.titleKey, section.ns).toLowerCase();
    const sectionTitleEn = txEn(section.titleKey, section.ns).toLowerCase();
    // Also match raw i18n key (contains readable English identifiers like "CheckForUpdates")
    const sectionKeyNorm = section.titleKey.toLowerCase();
    for (const item of section.items) {
      if (item.type === 'divider' || item.type === 'custom') continue;
      const title = tx(t, item.titleKey, item.ns).toLowerCase();
      const desc = item.descriptionKey ? tx(t, item.descriptionKey, item.ns).toLowerCase() : '';
      const titleEn = txEn(item.titleKey, item.ns).toLowerCase();
      const descEn = item.descriptionKey ? txEn(item.descriptionKey, item.ns).toLowerCase() : '';
      const titleKeyNorm = item.titleKey.toLowerCase();
      const descKeyNorm = item.descriptionKey?.toLowerCase() ?? '';
      if (
        title.includes(normalizedQuery) ||
        desc.includes(normalizedQuery) ||
        titleEn.includes(normalizedQuery) ||
        descEn.includes(normalizedQuery) ||
        sectionTitle.includes(normalizedQuery) ||
        sectionTitleEn.includes(normalizedQuery) ||
        titleKeyNorm.includes(normalizedQuery) ||
        descKeyNorm.includes(normalizedQuery) ||
        sectionKeyNorm.includes(normalizedQuery)
      ) {
        hits.push({ item, sectionId: section.id, sectionTitleKey: section.titleKey, sectionNs: section.ns });
      }
    }
  }

  return hits;
}

// ─── Inline renderers ────────────────────────────────────────────────

function BooleanField({ item, preferences, query, onNeedsRestart }: {
  item: PreferenceItem;
  onNeedsRestart: () => void;
  preferences: IPreferences;
  query: string;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const value = preferences[item.key] as boolean;
  const title = tx(t, item.titleKey, item.ns);
  const description = item.descriptionKey ? tx(t, item.descriptionKey, item.ns) : undefined;

  const handleChange = useCallback(async (checked: boolean) => {
    await window.service.preference.set(item.key, checked as IPreferences[typeof item.key]);
    if (item.sideEffectId) {
      const sideEffect = getSideEffect(item.sideEffectId);
      if (sideEffect) {
        await sideEffect(checked, { ...preferences, [item.key]: checked });
      }
    }
    if (item.needsRestart) onNeedsRestart();
  }, [item, onNeedsRestart, preferences]);

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

function EnumField({ item, preferences, query, onNeedsRestart }: {
  item: PreferenceItem & { type: 'preference-enum' };
  onNeedsRestart: () => void;
  preferences: IPreferences;
  query: string;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const value = preferences[item.key] as string;
  const title = tx(t, item.titleKey, item.ns);
  const description = item.descriptionKey ? tx(t, item.descriptionKey, item.ns) : undefined;

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
          onChange={async (event) => {
            await window.service.preference.set(item.key, event.target.value as IPreferences[typeof item.key]);
            if (item.needsRestart) onNeedsRestart();
          }}
          size='small'
          variant='outlined'
          sx={{ minWidth: 140 }}
        >
          {item.enumValues.map((v, index) => <MenuItem key={v} value={v}>{t(item.enumNames[index] ?? v)}</MenuItem>)}
        </Select>
      </ControlBlock>
    </SettingRow>
  );
}

function NumberField({ item, preferences, query, onNeedsRestart }: {
  item: PreferenceItem;
  onNeedsRestart: () => void;
  preferences: IPreferences;
  query: string;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const value = preferences[item.key] as number;
  const title = tx(t, item.titleKey, item.ns);
  const description = item.descriptionKey ? tx(t, item.descriptionKey, item.ns) : undefined;

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
          onChange={async (event) => {
            const newValue = Number(event.target.value);
            if (!Number.isNaN(newValue)) {
              await window.service.preference.set(item.key, newValue as IPreferences[typeof item.key]);
              if (item.needsRestart) onNeedsRestart();
            }
          }}
          size='small'
          variant='outlined'
          sx={{ width: 120 }}
        />
      </ControlBlock>
    </SettingRow>
  );
}

function ActionRow({ item, query }: {
  item: IActionItem;
  query: string;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const title = tx(t, item.titleKey, item.ns);
  const description = item.descriptionKey ? tx(t, item.descriptionKey, item.ns) : undefined;

  return (
    <SettingRow disablePadding>
      <SettingTextBlock>
        <SettingTitle>
          <HighlightText text={title} query={query} />
        </SettingTitle>
        {description
          ? (
            <SettingDescription>
              <HighlightText text={description} query={query} />
            </SettingDescription>
          )
          : (
            <SettingDescription>
              <HighlightText text={t('Preference.SearchOpenSection', { defaultValue: 'Open the section below to edit this setting' })} query='' />
            </SettingDescription>
          )}
      </SettingTextBlock>
    </SettingRow>
  );
}

function ReadOnlyRow({ item, query }: { item: PreferenceItem; query: string }): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const title = tx(t, item.titleKey, item.ns);
  return (
    <SettingRow disablePadding>
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

function renderHit(hit: ISearchHit, preferences: IPreferences, query: string, onNeedsRestart: () => void): React.JSX.Element | null {
  const { item } = hit;
  if (item.type === 'action') {
    return <ActionRow item={item} query={query} />;
  }
  if (!isPreferenceItem(item)) return null;

  switch (item.type) {
    case 'preference-boolean':
      return <BooleanField item={item} preferences={preferences} query={query} onNeedsRestart={onNeedsRestart} />;
    case 'preference-enum':
      return <EnumField item={item} preferences={preferences} query={query} onNeedsRestart={onNeedsRestart} />;
    case 'preference-number':
      return <NumberField item={item} preferences={preferences} query={query} onNeedsRestart={onNeedsRestart} />;
    default:
      return <ReadOnlyRow item={item} query={query} />;
  }
}

// ─── Main component ──────────────────────────────────────────────────

export function PreferenceSearchResultsView({ query, preferences, onNeedsRestart }: PreferenceSearchResultsViewProps): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const hits = collectSearchHits(query, t);

  if (hits.length === 0) {
    return (
      <Typography color='text.secondary' sx={{ mt: 2 }}>
        {t('Preference.SearchNoResult', { defaultValue: 'No settings found for "{{query}}"', query })}
      </Typography>
    );
  }

  return (
    <ResultsContainer>
      <List disablePadding>
        {hits.map((hit, index) => {
          const sectionTitle = tx(t, hit.sectionTitleKey, hit.sectionNs);
          const itemKey = hit.item.type === 'action'
            ? `action-${hit.item.handler}-${index}`
            : isPreferenceItem(hit.item)
            ? hit.item.key
            : `item-${index}`;

          return (
            <React.Fragment key={itemKey}>
              {index > 0 && <Divider />}
              <SectionLabel>
                <HighlightText text={sectionTitle} query={query} />
              </SectionLabel>
              {renderHit(hit, preferences, query, onNeedsRestart)}
            </React.Fragment>
          );
        })}
      </List>
    </ResultsContainer>
  );
}
