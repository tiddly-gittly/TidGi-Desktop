/**
 * Schema-driven renderer for record-backed settings (e.g. workspace config).
 * Preferences uses SchemaRenderer.tsx with IPreferences; this covers generic keyed records.
 */
import { Divider, List, Switch, TextField, Typography } from '@mui/material';
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
import { DeferredSectionSkeleton, INITIAL_GENERIC_SECTION_COUNT, IS_TEST_ENV, matchesPlatform, SearchSectionLabel, toKebabCase } from './genericSchemaRendererShared';
import { HighlightText } from './HighlightText';
import { Paper, SectionTitle } from './PreferenceComponents';

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
}: IGenericSectionRendererProps<TRecord>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle ref={sectionRef}>
        {t(section.titleKey, section.ns ? { ns: section.ns } : undefined)}
      </SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {section.items.map((item, index) => (
            <GenericItemRenderer
              key={item.type === 'divider' ? `divider-${index}` : ('key' in item ? item.key : `item-${index}`)}
              item={item}
              store={store}
              platform={platform}
              onNeedsRestart={onNeedsRestart}
            />
          ))}
        </List>
      </Paper>
    </>
  );
}

export interface IAllGenericSectionsRendererProps<TRecord extends Record<string, unknown>> {
  initialSectionCount?: number;
  onNeedsRestart: () => void;
  query?: string;
  sectionRefs: Map<string, React.RefObject<HTMLSpanElement | null>>;
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
  initialSectionCount = INITIAL_GENERIC_SECTION_COUNT,
}: IAllGenericSectionsRendererProps<TRecord>): React.JSX.Element {
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));
  const { t } = useTranslation();

  const visibleSections = React.useMemo(
    () => sections.filter((section) => !hiddenSections?.has(section.id) && !section.hidden),
    [hiddenSections, sections],
  );

  const [visibleCount, setVisibleCount] = React.useState(IS_TEST_ENV ? visibleSections.length : initialSectionCount);
  React.useEffect(() => {
    if (IS_TEST_ENV) return;
    if (query.trim()) return;
    if (visibleCount >= visibleSections.length) return;
    const id = requestIdleCallback(() => {
      setVisibleCount((count) => Math.min(count + initialSectionCount, visibleSections.length));
    }, { timeout: 500 });
    return () => {
      cancelIdleCallback(id);
    };
  }, [visibleCount, visibleSections.length, query, initialSectionCount]);

  if (query.trim()) {
    const hits = collectSettingSearchHits(visibleSections, query, { platform, t });
    if (hits.length === 0) {
      return (
        <Typography sx={{ color: 'text.secondary', mt: 2 }}>
          {t('Preference.SearchNoResult', { defaultValue: 'No settings found for "{{query}}"', query })}
        </Typography>
      );
    }
    return (
      <>
        {hits.map(({ item, section }, index) => {
          const schemaItem = item as GenericSettingItemDefinition;
          const sectionTitle = t(section.titleKey, section.ns ? { ns: section.ns } : undefined);
          const itemKey = 'key' in schemaItem ? schemaItem.key : ('handler' in schemaItem ? `action-${schemaItem.handler}-${index}` : `item-${index}`);
          return (
            <React.Fragment key={itemKey}>
              {index > 0 && <Divider />}
              <SearchSectionLabel>
                <HighlightText text={sectionTitle} query={query} />
              </SearchSectionLabel>
              <GenericItemRenderer
                item={schemaItem}
                store={store}
                platform={platform}
                onNeedsRestart={onNeedsRestart}
                query={query}
              />
            </React.Fragment>
          );
        })}
      </>
    );
  }

  return (
    <>
      {visibleSections.slice(0, visibleCount).map((section) => {
        const reference = sectionRefs.get(section.id) ?? React.createRef<HTMLSpanElement>();
        return (
          <GenericSectionRenderer
            key={section.id}
            section={section}
            sectionRef={reference}
            store={store}
            platform={platform}
            onNeedsRestart={onNeedsRestart}
          />
        );
      })}
      {visibleSections.slice(visibleCount).map((section) => <DeferredSectionSkeleton key={section.id} sectionRef={sectionRefs.get(section.id)} />)}
    </>
  );
}
