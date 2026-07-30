import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Box, Divider, List, ListItemButton, Skeleton, Switch, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { getActionHandler } from '@services/preferences/definitions/actionHandlers';
import { collectSettingSearchHits } from '@services/preferences/definitions/collectSettingSearchHits';
import { evaluateHidden } from '@services/preferences/definitions/conditions';
import { allSections } from '@services/preferences/definitions/registry';
import { getSideEffect } from '@services/preferences/definitions/sideEffects';
import type {
  IActionItem,
  IBooleanPreferenceItem,
  IEnumPreferenceItem,
  IFragmentListItem,
  IKeyedValueTabsPreferenceItem,
  INumberPreferenceItem,
  ISectionDefinition,
  IStringArrayPreferenceItem,
  IStringPreferenceItem,
  ITextPreferenceItem,
  PlatformCondition,
  PreferenceItemDefinition,
} from '@services/preferences/definitions/types';
import { usePreferenceObservable } from '@services/preferences/hooks';
import type { IPreferences } from '@services/preferences/interface';
import { getCustomComponent } from './customComponentRegistry';
import { HighlightText } from './HighlightText';
import { KeyValueTabs } from './KeyValueTabs';
import { Paper, SectionTitle } from './PreferenceComponents';
import { ProgressiveItemList } from './ProgressiveItemList';
import type { ISectionNavigationRequest } from './useSectionNavigation';
import { type IVirtualizedSettingsEntry, VirtualizedSettingsList } from './VirtualizedSettingsList';

// ─── Platform filter ─────────────────────────────────────────────────

function matchesPlatform(condition: PlatformCondition | undefined, platform: string | undefined): boolean {
  if (condition === undefined || platform === undefined) return true;
  if (condition === 'darwin') return platform === 'darwin';
  if (condition === '!darwin') return platform !== 'darwin';
  if (condition === 'win32') return platform === 'win32';
  return true;
}

/** Label shown in search results for the section the item belongs to. */
const SearchSectionLabel = styled(Typography)`
  color: ${({ theme }) => theme.palette.text.secondary};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 4px;
`;

// Variable-height virtualization unmounts sections outside the viewport.
// Keep uncommitted blur-based drafts above the virtual rows so scrolling
// cannot silently discard user input.
const PreferenceDraftContext = React.createContext<Map<string, string> | undefined>(undefined);

// ─── Item renderers ──────────────────────────────────────────────────

function BooleanItem({
  item,
  preference,
  onNeedsRestart,
  query = '',
}: {
  item: IBooleanPreferenceItem;
  onNeedsRestart: () => void;
  preference: IPreferences;
  query?: string;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const value = preference[item.key] as boolean;
  const primaryText = t(item.titleKey, item.ns ? { ns: item.ns } : undefined);
  const secondaryText = item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined;
  return (
    <ListItem
      secondaryAction={
        <Switch
          edge='end'
          color='primary'
          checked={value}
          onChange={async (event) => {
            const newValue = event.target.checked;
            await window.service.preference.set(item.key, newValue);
            if (item.sideEffectId) {
              const sideEffect = getSideEffect(item.sideEffectId);
              if (sideEffect) {
                await sideEffect(newValue, { ...preference, [item.key]: newValue });
              }
            }
            if (item.needsRestart) {
              onNeedsRestart();
            }
          }}
        />
      }
    >
      <ListItemText
        primary={<HighlightText text={primaryText} query={query} />}
        secondary={secondaryText ? <HighlightText text={secondaryText} query={query} /> : undefined}
      />
    </ListItem>
  );
}

function EnumItem({
  item,
  preference,
  onNeedsRestart,
  query = '',
}: {
  item: IEnumPreferenceItem;
  onNeedsRestart: () => void;
  preference: IPreferences;
  query?: string;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const value = preference[item.key] as string;
  const primaryText = t(item.titleKey, item.ns ? { ns: item.ns } : undefined);
  const secondaryText = item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined;

  return (
    <ListItem
      secondaryAction={
        <TextField
          select
          size='small'
          value={value}
          onChange={async (event) => {
            const newValue = event.target.value;
            await window.service.preference.set(item.key, newValue);
            if (item.sideEffectId) {
              const sideEffect = getSideEffect(item.sideEffectId);
              if (sideEffect) {
                await sideEffect(newValue, { ...preference, [item.key]: newValue as IPreferences[typeof item.key] });
              }
            }
            if (item.needsRestart) {
              onNeedsRestart();
            }
          }}
          slotProps={{
            select: { native: true },
          }}
          sx={{ minWidth: 120 }}
        >
          {item.enumValues.map((value_, index) => <option key={value_} value={value_}>{t(item.enumNames[index])}</option>)}
        </TextField>
      }
    >
      <ListItemText
        primary={<HighlightText text={primaryText} query={query} />}
        secondary={secondaryText ? <HighlightText text={secondaryText} query={query} /> : undefined}
      />
    </ListItem>
  );
}

function NumberItem({
  item,
  preference,
  onNeedsRestart,
  query = '',
}: {
  item: INumberPreferenceItem;
  onNeedsRestart: () => void;
  preference: IPreferences;
  query?: string;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const value = preference[item.key] as number;
  const primaryText = t(item.titleKey, item.ns ? { ns: item.ns } : undefined);
  const secondaryText = item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined;
  return (
    <ListItem
      secondaryAction={
        <TextField
          type='number'
          size='small'
          value={value}
          onChange={async (event) => {
            const newValue = Number(event.target.value);
            if (!Number.isNaN(newValue)) {
              await window.service.preference.set(item.key, newValue);
              if (item.needsRestart) {
                onNeedsRestart();
              }
            }
          }}
          sx={{ width: 100 }}
        />
      }
    >
      <ListItemText
        primary={<HighlightText text={primaryText} query={query} />}
        secondary={secondaryText ? <HighlightText text={secondaryText} query={query} /> : undefined}
      />
    </ListItem>
  );
}

function StringItem({
  item,
  preference,
  onNeedsRestart,
  query = '',
}: {
  item: IStringPreferenceItem | ITextPreferenceItem;
  onNeedsRestart: () => void;
  preference: IPreferences;
  query?: string;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const value = (preference[item.key] as string) ?? '';
  const primaryText = t(item.titleKey, item.ns ? { ns: item.ns } : undefined);
  const secondaryText = item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined;
  return (
    <ListItem>
      <ListItemText
        primary={<HighlightText text={primaryText} query={query} />}
        secondary={secondaryText ? <HighlightText text={secondaryText} query={query} /> : undefined}
      />
      <TextField
        size='small'
        value={value}
        multiline={item.multiline}
        onChange={async (event) => {
          await window.service.preference.set(item.key, event.target.value);
          if (item.needsRestart) {
            onNeedsRestart();
          }
        }}
        sx={{ minWidth: 150 }}
        slotProps={{ htmlInput: { 'data-testid': `preference-${item.key}` } }}
      />
    </ListItem>
  );
}

function StringArrayItem({
  item,
  preference,
  onNeedsRestart,
  query = '',
}: {
  item: IStringArrayPreferenceItem;
  onNeedsRestart: () => void;
  preference: IPreferences;
  query?: string;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const value = (preference[item.key] as string[]) ?? [];
  const draftStore = React.useContext(PreferenceDraftContext);
  const draftKey = `preference:${item.key}`;
  const [localValue, setLocalValue] = React.useState(() => draftStore?.get(draftKey) ?? value.join('\n'));
  React.useEffect(() => {
    if (!draftStore?.has(draftKey)) setLocalValue(value.join('\n'));
  }, [draftKey, draftStore, value]);
  const primaryText = t(item.titleKey, item.ns ? { ns: item.ns } : undefined);
  const secondaryText = item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined;

  return (
    <ListItem>
      <ListItemText
        primary={<HighlightText text={primaryText} query={query} />}
        secondary={secondaryText ? <HighlightText text={secondaryText} query={query} /> : undefined}
      />
      <TextField
        size='small'
        value={localValue}
        multiline
        minRows={2}
        onChange={(event) => {
          setLocalValue(event.target.value);
          draftStore?.set(draftKey, event.target.value);
        }}
        onBlur={async () => {
          const newArray = localValue.split('\n').map((s) => s.trim()).filter(Boolean);
          await window.service.preference.set(item.key, newArray);
          draftStore?.delete(draftKey);
          if (item.needsRestart) {
            onNeedsRestart();
          }
        }}
        sx={{ minWidth: 200 }}
      />
    </ListItem>
  );
}

function KeyedValueStringField({
  draftKey,
  testId,
  value,
  onCommit,
}: {
  draftKey: string;
  onCommit: (value: string) => Promise<void>;
  testId: string;
  value: string;
}): React.JSX.Element {
  const draftStore = React.useContext(PreferenceDraftContext);
  const [localValue, setLocalValue] = React.useState(() => draftStore?.get(draftKey) ?? value);
  React.useEffect(() => {
    if (!draftStore?.has(draftKey)) setLocalValue(value);
  }, [draftKey, draftStore, value]);

  return (
    <TextField
      data-testid={testId}
      size='small'
      value={localValue}
      placeholder='http://127.0.0.1:8080'
      onChange={event => {
        setLocalValue(event.target.value);
        draftStore?.set(draftKey, event.target.value);
      }}
      onBlur={async () => {
        await onCommit(localValue.trim());
        draftStore?.delete(draftKey);
      }}
      sx={{ minWidth: 280 }}
    />
  );
}

function KeyedValueTabsItem({
  item,
  preference,
  onNeedsRestart,
  query = '',
}: {
  item: IKeyedValueTabsPreferenceItem;
  onNeedsRestart: () => void;
  preference: IPreferences;
  query?: string;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const record = (preference[item.key] ?? {}) as unknown as Record<string, Record<string, unknown>>;
  const primaryText = t(item.titleKey, item.ns ? { ns: item.ns } : undefined);
  const secondaryText = item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined;

  const updateField = async (tabKey: string, fieldKey: string, value: unknown) => {
    const latestPreferenceValue = await window.service.preference.get(item.key);
    const latestRecord = (latestPreferenceValue ?? {}) as unknown as Record<string, Record<string, unknown>>;
    const nextValue = {
      ...latestRecord,
      [tabKey]: {
        ...(latestRecord[tabKey] ?? {}),
        [fieldKey]: value,
      },
    } as unknown as IPreferences[typeof item.key];
    await window.service.preference.set(item.key, nextValue);
    if (item.needsRestart) {
      onNeedsRestart();
    }
  };

  if (query) {
    return (
      <ListItem>
        <ListItemText
          primary={<HighlightText text={primaryText} query={query} />}
          secondary={secondaryText ? <HighlightText text={secondaryText} query={query} /> : undefined}
        />
      </ListItem>
    );
  }

  return (
    <ListItem sx={{ alignItems: 'stretch', flexDirection: 'column' }}>
      <ListItemText primary={primaryText} secondary={secondaryText} />
      <KeyValueTabs
        ariaLabel={primaryText}
        testId={`${item.key}-tabs`}
        tabs={item.tabs.map(tab => {
          const tabValue = record[tab.key] ?? {};
          return {
            key: tab.key,
            label: t(tab.titleKey, item.ns ? { ns: item.ns } : undefined),
            panel: (
              <Box>
                {tab.descriptionKey && (
                  <Typography color='text.secondary' variant='body2' sx={{ mb: 2 }}>
                    {t(tab.descriptionKey, item.ns ? { ns: item.ns } : undefined)}
                  </Typography>
                )}
                {tab.fields.map(field => {
                  if (
                    field.hiddenWhenField &&
                    tabValue[field.hiddenWhenField.key] === field.hiddenWhenField.equals
                  ) {
                    return null;
                  }
                  const fieldTitle = t(field.titleKey, item.ns ? { ns: item.ns } : undefined);
                  const fieldDescription = field.descriptionKey
                    ? t(field.descriptionKey, item.ns ? { ns: item.ns } : undefined)
                    : undefined;
                  const testId = `${item.key}-${tab.key}-${field.key}`;
                  const rawFieldValue = tabValue[field.key];
                  return (
                    <Box
                      key={field.key}
                      sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1 }}
                    >
                      <ListItemText primary={fieldTitle} secondary={fieldDescription} />
                      {field.type === 'boolean' && (
                        <Switch
                          data-testid={testId}
                          checked={Boolean(tabValue[field.key])}
                          onChange={async event => {
                            await updateField(tab.key, field.key, event.target.checked);
                          }}
                        />
                      )}
                      {field.type === 'string' && (
                        <KeyedValueStringField
                          draftKey={`${item.key}:${tab.key}:${field.key}`}
                          testId={testId}
                          value={typeof rawFieldValue === 'string' ? rawFieldValue : ''}
                          onCommit={async value => {
                            await updateField(tab.key, field.key, value);
                          }}
                        />
                      )}
                    </Box>
                  );
                })}
              </Box>
            ),
          };
        })}
      />
    </ListItem>
  );
}

function ActionItem({ item, query = '' }: { item: IActionItem; query?: string }): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const primaryText = t(item.titleKey, item.ns ? { ns: item.ns } : undefined);
  const secondaryText = item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined;
  return (
    <ListItemButton
      onClick={async () => {
        const handler = getActionHandler(item.handler);
        await handler(...(item.args ?? []));
      }}
    >
      <ListItemText
        primary={<HighlightText text={primaryText} query={query} />}
        secondary={secondaryText ? <HighlightText text={secondaryText} query={query} /> : undefined}
      />
      <ChevronRightIcon color='action' />
    </ListItemButton>
  );
}

function FragmentListItem({ item, onNeedsRestart }: { item: IFragmentListItem; onNeedsRestart: () => void }): React.JSX.Element | null {
  const ItemComponent = getCustomComponent(item.itemComponentId);
  if (!ItemComponent) {
    console.warn(`Fragment list item component not registered: ${item.itemComponentId}`);
    return null;
  }
  return <ItemComponent onNeedsRestart={onNeedsRestart} />;
}

// ─── Section renderer ────────────────────────────────────────────────

function ItemRenderer({
  item,
  preference,
  platform,
  onNeedsRestart,
  query = '',
}: {
  item: PreferenceItemDefinition;
  onNeedsRestart: () => void;
  platform: string | undefined;
  preference: IPreferences;
  query?: string;
}): React.JSX.Element | null {
  const { t } = useTranslation(['translation', 'agent']);

  if (item.type === 'divider') return query ? null : <Divider />;
  if ('hidden' in item && evaluateHidden(item.hidden, { preference, platform })) return null;
  if ('platform' in item && !matchesPlatform(item.platform, platform)) return null;

  switch (item.type) {
    case 'preference-boolean':
      return <BooleanItem item={item} preference={preference} onNeedsRestart={onNeedsRestart} query={query} />;
    case 'preference-enum':
      return <EnumItem item={item} preference={preference} onNeedsRestart={onNeedsRestart} query={query} />;
    case 'preference-number':
      return <NumberItem item={item} preference={preference} onNeedsRestart={onNeedsRestart} query={query} />;
    case 'preference-string':
      return <StringItem item={item} preference={preference} onNeedsRestart={onNeedsRestart} query={query} />;
    case 'preference-text':
      return <StringItem item={item} preference={preference} onNeedsRestart={onNeedsRestart} query={query} />;
    case 'preference-string-array':
      return <StringArrayItem item={item} preference={preference} onNeedsRestart={onNeedsRestart} query={query} />;
    case 'preference-key-value-tabs':
      return <KeyedValueTabsItem item={item} preference={preference} onNeedsRestart={onNeedsRestart} query={query} />;
    case 'action':
      return <ActionItem item={item} query={query} />;
    case 'custom': {
      const Component = getCustomComponent(item.componentId);
      if (query) {
        if (Component) {
          return <Component onNeedsRestart={onNeedsRestart} />;
        }
        // Fallback when custom component is unavailable in search mode:
        // preserve the item in results with highlighted title/description.
        const primaryText = t(item.titleKey, item.ns ? { ns: item.ns } : undefined);
        const secondaryText = item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined;
        return (
          <ListItem>
            <ListItemText
              primary={<HighlightText text={primaryText} query={query} />}
              secondary={secondaryText ? <HighlightText text={secondaryText} query={query} /> : undefined}
            />
          </ListItem>
        );
      }
      if (!Component) {
        console.warn(`Custom component not registered: ${item.componentId}`);
        return null;
      }
      return <Component onNeedsRestart={onNeedsRestart} />;
    }
    case 'fragment-list':
      return <FragmentListItem item={item} onNeedsRestart={onNeedsRestart} />;
    default:
      return null;
  }
}

interface ISectionRendererProps {
  onNeedsRestart: () => void;
  platform: string | undefined;
  preference: IPreferences;
  renderAllItems?: boolean;
  sectionRef: React.RefObject<HTMLSpanElement | null>;
  section: ISectionDefinition;
}

export function SectionRenderer({ section, sectionRef, preference, platform, onNeedsRestart, renderAllItems }: ISectionRendererProps): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  return (
    <>
      <SectionTitle ref={sectionRef}>
        {t(section.titleKey, section.ns ? { ns: section.ns } : undefined)}
      </SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          <ProgressiveItemList
            items={section.items}
            renderAll={renderAllItems}
            renderItem={(item, index) => (
              <ItemRenderer
                key={item.type === 'divider' ? `divider-${index}` : ('key' in item ? item.key : `item-${index}`)}
                item={item}
                preference={preference}
                platform={platform}
                onNeedsRestart={onNeedsRestart}
              />
            )}
          />
        </List>
      </Paper>
    </>
  );
}

// ─── All sections view ───────────────────────────────────────────────

interface IAllSectionsRendererProps {
  navigationRequest?: ISectionNavigationRequest;
  onNavigationComplete?: (requestId: number) => void;
  onNeedsRestart: () => void;
  /** When provided, renders a flat filtered search-results view instead of the full sections layout. */
  query?: string;
  sectionRefs?: Map<string, React.RefObject<HTMLSpanElement | null>>;
}

interface IPreferenceSectionEntry extends IVirtualizedSettingsEntry {
  section: ISectionDefinition;
  sectionRef: React.RefObject<HTMLSpanElement | null>;
}

interface IPreferenceSearchEntry extends IVirtualizedSettingsEntry {
  item: PreferenceItemDefinition;
  section: ISectionDefinition;
  sectionTitle: string;
}

export function AllSectionsRenderer({
  onNeedsRestart,
  sectionRefs,
  navigationRequest,
  onNavigationComplete,
  query = '',
}: IAllSectionsRendererProps): React.JSX.Element {
  const draftStore = React.useRef(new Map<string, string>());
  const preference = usePreferenceObservable();
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));
  const isTest = usePromiseValue(async () => await window.service.context.get('isTest'));
  const { t } = useTranslation(['translation', 'agent']);

  const internalSectionReferences = React.useMemo(() => {
    const references = new Map<string, React.RefObject<HTMLSpanElement | null>>();
    for (const section of allSections) references.set(section.id, React.createRef<HTMLSpanElement>());
    return references;
  }, []);
  const references = sectionRefs ?? internalSectionReferences;

  const visibleSections = React.useMemo(
    () =>
      preference === undefined
        ? []
        : allSections.filter((section) => !evaluateHidden(section.hidden, { preference, platform })),
    [platform, preference],
  );
  const sectionEntries = React.useMemo<IPreferenceSectionEntry[]>(
    () =>
      visibleSections.map((section) => ({
        estimatedHeight: Math.max(200, Math.min(800, 80 + section.items.length * 56)),
        id: section.id,
        section,
        sectionRef: references.get(section.id) ?? React.createRef<HTMLSpanElement>(),
      })),
    [references, visibleSections],
  );
  const renderSectionEntry = React.useCallback((entry: IPreferenceSectionEntry) => {
    const { section, sectionRef } = entry;
    if (section.CustomSectionComponent) {
      const CustomComponent = section.CustomSectionComponent;
      return <CustomComponent sectionRef={sectionRef} onNeedsRestart={onNeedsRestart} />;
    }
    if (!preference) return null;
    return (
      <SectionRenderer
        section={section}
        sectionRef={sectionRef}
        preference={preference}
        platform={platform}
        onNeedsRestart={onNeedsRestart}
        renderAllItems={isTest}
      />
    );
  }, [isTest, onNeedsRestart, platform, preference]);

  if (isTest === undefined) {
    return <Skeleton variant='rounded' height={240} />;
  }

  // ── Search mode ───────────────────────────────────────────────────
  if (query.trim()) {
    if (preference === undefined) {
      return <Skeleton variant='text' width={200} height={24} sx={{ mt: 2 }} />;
    }
    const hits = collectSettingSearchHits(allSections, query, { platform, t }, {
      shouldSkipSection: (section) => evaluateHidden(section.hidden, { preference, platform }),
      shouldSkipItem: (item) => item.hidden !== undefined && evaluateHidden(item.hidden, { preference, platform }),
    });
    if (hits.length === 0) {
      return (
        <Typography
          sx={{
            color: 'text.secondary',
            mt: 2,
          }}
        >
          {t('Preference.SearchNoResult', { defaultValue: 'No settings found for "{{query}}"', query })}
        </Typography>
      );
    }
    const searchEntries: IPreferenceSearchEntry[] = hits.map(({ item, section }, index) => {
      const preferenceItem = item as PreferenceItemDefinition;
      const itemKey = 'key' in preferenceItem ? preferenceItem.key : ('handler' in preferenceItem ? `action-${preferenceItem.handler}` : `item-${index}`);
      return {
        estimatedHeight: 100,
        id: `${section.id}:${itemKey}:${index}`,
        item: preferenceItem,
        section,
        sectionTitle: t(section.titleKey, section.ns ? { ns: section.ns } : undefined),
      };
    });
    return (
      <PreferenceDraftContext.Provider value={draftStore.current}>
        <VirtualizedSettingsList
          entries={searchEntries}
          defaultRowHeight={100}
          virtualize={!isTest}
          renderEntry={(entry) => (
            <>
              <SearchSectionLabel>
                <HighlightText text={entry.sectionTitle} query={query} />
              </SearchSectionLabel>
              <ItemRenderer
                item={entry.item}
                preference={preference}
                platform={platform}
                onNeedsRestart={onNeedsRestart}
                query={query}
              />
              <Divider />
            </>
          )}
        />
      </PreferenceDraftContext.Provider>
    );
  }

  // ── Normal (non-search) mode ──────────────────────────────────────

  if (preference === undefined) {
    return <Skeleton variant='rounded' height={240} />;
  }

  return (
    <PreferenceDraftContext.Provider value={draftStore.current}>
      <VirtualizedSettingsList
        entries={sectionEntries}
        navigationRequest={navigationRequest}
        onNavigationComplete={onNavigationComplete}
        renderEntry={renderSectionEntry}
        virtualize={!isTest}
      />
    </PreferenceDraftContext.Provider>
  );
}
