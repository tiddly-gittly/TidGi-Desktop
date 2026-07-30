/**
 * Schema-driven renderer for record-backed settings (e.g. workspace config).
 * Preferences uses SchemaRenderer.tsx with IPreferences; this covers generic keyed records.
 */
import { Divider, List, Skeleton, Switch, TextField, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { collectSettingSearchHits } from '@services/preferences/definitions/collectSettingSearchHits';
import type {
  GenericSettingItemDefinition,
  ICustomItem,
  IGenericBooleanItem,
  IGenericEnumItem,
  IGenericNumberItem,
  IGenericSectionDefinition,
  IGenericStringItem,
} from '@services/preferences/definitions/types';
import { getCustomComponent } from './customComponentRegistry';
import { matchesPlatform, SearchSectionLabel, toKebabCase } from './genericSchemaRendererShared';
import { HighlightText } from './HighlightText';
import { Paper, SectionTitle } from './PreferenceComponents';
import { ProgressiveItemList } from './ProgressiveItemList';
import type { ISectionNavigationRequest } from './useSectionNavigation';
import { type IVirtualizedSettingsEntry, VirtualizedSettingsList } from './VirtualizedSettingsList';

export interface IRecordSchemaStore<TRecord extends Record<string, unknown>> {
  record: TRecord;
  update: (patch: Partial<TRecord>, needsRestart?: boolean) => void;
}

export function createRecordSchemaStore<TRecord extends Record<string, unknown>>(
  record: TRecord,
  setRecord: (next: TRecord, needsRestart?: boolean) => void,
): IRecordSchemaStore<TRecord> {
  return {
    record,
    update: (patch, needsRestart) => {
      setRecord({ ...record, ...patch }, needsRestart);
    },
  };
}

function BooleanItem<TRecord extends Record<string, unknown>>({
  item,
  store,
  query = '',
}: {
  item: IGenericBooleanItem;
  query?: string;
  store: IRecordSchemaStore<TRecord>;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = store.record[item.key] as boolean;
  const primaryText = t(item.titleKey, item.ns ? { ns: item.ns } : undefined);
  const secondaryText = item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined;
  return (
    <ListItem
      secondaryAction={
        <Switch
          edge='end'
          color='primary'
          checked={value ?? false}
          data-testid={item.testId ?? `${toKebabCase(item.key)}-switch`}
          onChange={(event) => {
            store.update({ [item.key]: event.target.checked } as Partial<TRecord>, item.needsRestart);
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

function EnumItem<TRecord extends Record<string, unknown>>({
  item,
  store,
  query = '',
}: {
  item: IGenericEnumItem;
  query?: string;
  store: IRecordSchemaStore<TRecord>;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = store.record[item.key] as string;
  const primaryText = t(item.titleKey, item.ns ? { ns: item.ns } : undefined);
  const secondaryText = item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined;
  return (
    <ListItem
      secondaryAction={
        <TextField
          select
          size='small'
          value={value ?? ''}
          onChange={(event) => {
            store.update({ [item.key]: event.target.value } as Partial<TRecord>, item.needsRestart);
          }}
          slotProps={{ select: { native: true } }}
          sx={{ minWidth: 120 }}
        >
          {item.enumValues.map((enumValue, index) => <option key={enumValue} value={enumValue}>{t(item.enumNames[index])}</option>)}
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

function NumberItem<TRecord extends Record<string, unknown>>({
  item,
  store,
  query = '',
}: {
  item: IGenericNumberItem;
  query?: string;
  store: IRecordSchemaStore<TRecord>;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = store.record[item.key] as number;
  const primaryText = t(item.titleKey, item.ns ? { ns: item.ns } : undefined);
  const secondaryText = item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined;
  return (
    <ListItem
      secondaryAction={
        <TextField
          type='number'
          size='small'
          value={value ?? 0}
          onChange={(event) => {
            const newValue = Number(event.target.value);
            if (!Number.isNaN(newValue)) {
              store.update({ [item.key]: newValue } as Partial<TRecord>, item.needsRestart);
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

function StringItem<TRecord extends Record<string, unknown>>({
  item,
  store,
  query = '',
}: {
  item: IGenericStringItem;
  query?: string;
  store: IRecordSchemaStore<TRecord>;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = (store.record[item.key] as string) ?? '';
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
        onChange={(event) => {
          store.update({ [item.key]: event.target.value } as Partial<TRecord>, item.needsRestart);
        }}
        sx={{ minWidth: 150 }}
      />
    </ListItem>
  );
}

function CustomItemWrapper({ item, onNeedsRestart }: { item: ICustomItem; onNeedsRestart: () => void }): React.JSX.Element | null {
  const Component = getCustomComponent(item.componentId);
  if (!Component) {
    console.warn(`Custom component not registered: ${item.componentId}`);
    return null;
  }
  return <Component onNeedsRestart={onNeedsRestart} />;
}

function GenericItemRenderer<TRecord extends Record<string, unknown>>({
  item,
  store,
  platform,
  onNeedsRestart,
  query = '',
}: {
  item: GenericSettingItemDefinition;
  onNeedsRestart: () => void;
  platform: string | undefined;
  query?: string;
  store: IRecordSchemaStore<TRecord>;
}): React.JSX.Element | null {
  const { t } = useTranslation();

  if (item.type === 'divider') return query ? null : <Divider />;
  if ('platform' in item && !matchesPlatform(item.platform, platform)) return null;

  switch (item.type) {
    case 'preference-boolean':
      return <BooleanItem item={item} store={store} query={query} />;
    case 'preference-enum':
      return <EnumItem item={item} store={store} query={query} />;
    case 'preference-number':
      return <NumberItem item={item} store={store} query={query} />;
    case 'preference-string':
      return <StringItem item={item} store={store} query={query} />;
    case 'action':
      return null;
    case 'custom': {
      const Component = getCustomComponent(item.componentId);
      if (Component) {
        return <Component onNeedsRestart={onNeedsRestart} />;
      }
      if (query) {
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
      return <CustomItemWrapper item={item} onNeedsRestart={onNeedsRestart} />;
    }
  }
}

interface IGenericSectionRendererProps<TRecord extends Record<string, unknown>> {
  onNeedsRestart: () => void;
  platform: string | undefined;
  renderAllItems?: boolean;
  section: IGenericSectionDefinition;
  sectionRef: React.RefObject<HTMLSpanElement | null>;
  store: IRecordSchemaStore<TRecord>;
}

export function GenericSectionRenderer<TRecord extends Record<string, unknown>>({
  section,
  sectionRef,
  store,
  platform,
  onNeedsRestart,
  renderAllItems,
}: IGenericSectionRendererProps<TRecord>): React.JSX.Element {
  const { t } = useTranslation();
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
              <GenericItemRenderer
                key={item.type === 'divider' ? `divider-${index}` : ('key' in item ? item.key : `item-${index}`)}
                item={item}
                store={store}
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

export interface IAllGenericSectionsRendererProps<TRecord extends Record<string, unknown>> {
  navigationRequest?: ISectionNavigationRequest;
  onNavigationComplete?: (requestId: number) => void;
  onNeedsRestart: () => void;
  query?: string;
  sectionRefs?: Map<string, React.RefObject<HTMLSpanElement | null>>;
  sections: IGenericSectionDefinition[];
  store: IRecordSchemaStore<TRecord>;
  hiddenSections?: Set<string>;
}

export function AllGenericSectionsRenderer<TRecord extends Record<string, unknown>>({
  onNeedsRestart,
  sectionRefs,
  sections,
  store,
  hiddenSections,
  query = '',
  navigationRequest,
  onNavigationComplete,
}: IAllGenericSectionsRendererProps<TRecord>): React.JSX.Element {
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));
  const isTest = usePromiseValue(async () => await window.service.context.get('isTest'));
  const { t } = useTranslation();

  const visibleSections = React.useMemo(
    () => sections.filter((section) => !hiddenSections?.has(section.id) && !section.hidden),
    [hiddenSections, sections],
  );

  const internalSectionReferences = React.useMemo(() => {
    const references = new Map<string, React.RefObject<HTMLSpanElement | null>>();
    for (const section of sections) references.set(section.id, React.createRef<HTMLSpanElement>());
    return references;
  }, [sections]);
  const references = sectionRefs ?? internalSectionReferences;

  interface IGenericSectionEntry extends IVirtualizedSettingsEntry {
    section: IGenericSectionDefinition;
    sectionRef: React.RefObject<HTMLSpanElement | null>;
  }
  const sectionEntries = React.useMemo<IGenericSectionEntry[]>(
    () =>
      visibleSections.map((section) => ({
        estimatedHeight: Math.max(200, Math.min(800, 80 + section.items.length * 56)),
        id: section.id,
        section,
        sectionRef: references.get(section.id) ?? React.createRef<HTMLSpanElement>(),
      })),
    [references, visibleSections],
  );
  const renderSectionEntry = React.useCallback((entry: IGenericSectionEntry) => (
    <GenericSectionRenderer
      section={entry.section}
      sectionRef={entry.sectionRef}
      store={store}
      platform={platform}
      onNeedsRestart={onNeedsRestart}
      renderAllItems={isTest}
    />
  ), [isTest, onNeedsRestart, platform, store]);

  if (isTest === undefined) {
    return <Skeleton variant='rounded' height={240} />;
  }

  if (query.trim()) {
    const hits = collectSettingSearchHits(visibleSections, query, { platform, t });
    if (hits.length === 0) {
      return (
        <Typography sx={{ color: 'text.secondary', mt: 2 }}>
          {t('Preference.SearchNoResult', { defaultValue: 'No settings found for "{{query}}"', query })}
        </Typography>
      );
    }
    const searchEntries = hits.map(({ item, section }, index) => {
      const schemaItem = item as GenericSettingItemDefinition;
      const itemKey = 'key' in schemaItem ? schemaItem.key : ('handler' in schemaItem ? `action-${schemaItem.handler}` : `item-${index}`);
      return {
        estimatedHeight: 100,
        id: `${section.id}:${itemKey}:${index}`,
        item: schemaItem,
        sectionTitle: t(section.titleKey, section.ns ? { ns: section.ns } : undefined),
      };
    });
    return (
      <VirtualizedSettingsList
        entries={searchEntries}
        defaultRowHeight={100}
        renderEntry={(entry) => (
          <>
            <SearchSectionLabel>
              <HighlightText text={entry.sectionTitle} query={query} />
            </SearchSectionLabel>
            <GenericItemRenderer
              item={entry.item}
              store={store}
              platform={platform}
              onNeedsRestart={onNeedsRestart}
              query={query}
            />
            <Divider />
          </>
        )}
      />
    );
  }

  return (
    <VirtualizedSettingsList
      entries={sectionEntries}
      navigationRequest={navigationRequest}
      onNavigationComplete={onNavigationComplete}
      renderEntry={renderSectionEntry}
    />
  );
}
