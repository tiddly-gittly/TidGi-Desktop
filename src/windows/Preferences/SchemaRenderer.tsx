import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Divider, List, ListItemButton, Skeleton, Switch, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import i18next from 'i18next';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { getActionHandler } from '@services/preferences/definitions/actionHandlers';
import { allSections } from '@services/preferences/definitions/registry';
import { getSideEffect } from '@services/preferences/definitions/sideEffects';
import type {
  IActionItem,
  IBooleanPreferenceItem,
  ICustomItem,
  IEnumPreferenceItem,
  INumberPreferenceItem,
  ISectionDefinition,
  IStringArrayPreferenceItem,
  IStringPreferenceItem,
  PlatformCondition,
  PreferenceItemDefinition,
} from '@services/preferences/definitions/types';
import { usePreferenceObservable } from '@services/preferences/hooks';
import type { IPreferences } from '@services/preferences/interface';
import { getCustomComponent } from './customComponentRegistry';
import { HighlightText } from './HighlightText';
import { Paper, SectionTitle } from './PreferenceComponents';

// ─── Platform filter ─────────────────────────────────────────────────

function matchesPlatform(condition: PlatformCondition | undefined, platform: string | undefined): boolean {
  if (condition === undefined || platform === undefined) return true;
  if (condition === 'darwin') return platform === 'darwin';
  if (condition === '!darwin') return platform !== 'darwin';
  if (condition === 'win32') return platform === 'win32';
  return true;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Return the English translation for a key — used for search matching independent of UI language. */
function txEn(key: string, ns?: string): string {
  try {
    return ns ? (i18next.t(key, { lng: 'en', ns })) : (i18next.t(key, { lng: 'en' }));
  } catch {
    return '';
  }
}

/** Label shown in search results for the section the item belongs to. */
const SearchSectionLabel = styled(Typography)`
  color: ${({ theme }) => theme.palette.text.secondary};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 4px;
`;

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
            await window.service.preference.set(item.key, newValue as IPreferences[typeof item.key]);
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
            await window.service.preference.set(item.key, newValue as IPreferences[typeof item.key]);
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
              await window.service.preference.set(item.key, newValue as IPreferences[typeof item.key]);
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
  item: IStringPreferenceItem;
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
          await window.service.preference.set(item.key, event.target.value as IPreferences[typeof item.key]);
          if (item.needsRestart) {
            onNeedsRestart();
          }
        }}
        sx={{ minWidth: 150 }}
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
  const [localValue, setLocalValue] = React.useState(value.join('\n'));
  React.useEffect(() => {
    setLocalValue(value.join('\n'));
  }, [value.join('\n')]);
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
        }}
        onBlur={async () => {
          const newArray = localValue.split('\n').map((s) => s.trim()).filter(Boolean);
          await window.service.preference.set(item.key, newArray as IPreferences[typeof item.key]);
          if (item.needsRestart) {
            onNeedsRestart();
          }
        }}
        sx={{ minWidth: 200 }}
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

function CustomItemWrapper({ item, onNeedsRestart }: { item: ICustomItem; onNeedsRestart: () => void }): React.JSX.Element | null {
  const Component = getCustomComponent(item.componentId);
  if (!Component) {
    console.warn(`Custom component not registered: ${item.componentId}`);
    return null;
  }
  return <Component onNeedsRestart={onNeedsRestart} />;
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
  if (item.type === 'divider') return query ? null : <Divider />;
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
    case 'preference-string-array':
      return <StringArrayItem item={item} preference={preference} onNeedsRestart={onNeedsRestart} query={query} />;
    case 'action':
      return <ActionItem item={item} query={query} />;
    case 'custom':
      // In search mode: show a read-only info card so the user knows where to find it.
      // In normal mode: render the registered custom component.
      if (query) {
        const primaryText = i18next.t(item.titleKey, item.ns ? { ns: item.ns } : undefined);
        const secondaryText = item.descriptionKey ? i18next.t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined;
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

// ─── Search helpers ───────────────────────────────────────────────────

interface ISearchHit {
  item: PreferenceItemDefinition;
  section: ISectionDefinition;
}

function collectSearchHits(query: string, platform: string | undefined, t: (key: string, options?: Record<string, unknown>) => string): ISearchHit[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const hits: ISearchHit[] = [];
  for (const section of allSections) {
    const sectionTitleLower = txEn(section.titleKey, section.ns).toLowerCase();
    const sectionTitleCurrent = t(section.titleKey, section.ns ? { ns: section.ns } : undefined).toLowerCase();
    const sectionKeyLower = section.titleKey.toLowerCase();
    for (const item of section.items) {
      if (item.type === 'divider') continue;
      if ('platform' in item && !matchesPlatform(item.platform, platform)) continue;
      const titleEn = txEn(item.titleKey, item.ns).toLowerCase();
      const titleCurrent = t(item.titleKey, item.ns ? { ns: item.ns } : undefined).toLowerCase();
      const descEn = item.descriptionKey ? txEn(item.descriptionKey, item.ns).toLowerCase() : '';
      const descCurrent = item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined).toLowerCase() : '';
      const titleKeyLower = item.titleKey.toLowerCase();
      const descKeyLower = item.descriptionKey?.toLowerCase() ?? '';
      if (
        titleEn.includes(q) ||
        titleCurrent.includes(q) ||
        descEn.includes(q) ||
        descCurrent.includes(q) ||
        titleKeyLower.includes(q) ||
        descKeyLower.includes(q) ||
        sectionTitleLower.includes(q) ||
        sectionTitleCurrent.includes(q) ||
        sectionKeyLower.includes(q)
      ) {
        hits.push({ item, section });
      }
    }
  }
  return hits;
}

interface ISectionRendererProps {
  onNeedsRestart: () => void;
  platform: string | undefined;
  preference: IPreferences;
  sectionRef: React.RefObject<HTMLSpanElement | null>;
  section: ISectionDefinition;
}

export function SectionRenderer({ section, sectionRef, preference, platform, onNeedsRestart }: ISectionRendererProps): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  return (
    <>
      <SectionTitle ref={sectionRef}>
        {t(section.titleKey, section.ns ? { ns: section.ns } : undefined)}
      </SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined
            ? <ListItem>{t('Loading')}</ListItem>
            : section.items.map((item, index) => (
              <ItemRenderer
                key={item.type === 'divider' ? `divider-${index}` : ('key' in item ? item.key : `item-${index}`)}
                item={item}
                preference={preference}
                platform={platform}
                onNeedsRestart={onNeedsRestart}
              />
            ))}
        </List>
      </Paper>
    </>
  );
}

// ─── All sections view ───────────────────────────────────────────────

interface IAllSectionsRendererProps {
  onNeedsRestart: () => void;
  /** When provided, renders a flat filtered search-results view instead of the full sections layout. */
  query?: string;
  sectionRefs: Map<string, React.RefObject<HTMLSpanElement | null>>;
}

const INITIAL_SECTION_COUNT = 4;
const IS_TEST_ENV = process.env.NODE_ENV === 'test';

/** Placeholder skeleton shown for deferred sections while waiting for idle time */
function DeferredSectionSkeleton({ sectionRef }: { sectionRef?: React.RefObject<HTMLSpanElement | null> }): React.JSX.Element {
  return (
    <>
      {/* Invisible anchor so sidebar scrollIntoView works even before the real section renders */}
      <span ref={sectionRef} style={{ display: 'block', height: 0, overflow: 'hidden' }} />
      <Skeleton variant='text' width={160} height={20} sx={{ mb: 1, mt: 2 }} />
      <Skeleton variant='rounded' height={56} sx={{ mb: 0.5 }} />
      <Skeleton variant='rounded' height={56} sx={{ mb: 0.5 }} />
      <Skeleton variant='rounded' height={56} sx={{ mb: 2 }} />
    </>
  );
}

export function AllSectionsRenderer({ onNeedsRestart, sectionRefs, query = '' }: IAllSectionsRendererProps): React.JSX.Element {
  const preference = usePreferenceObservable();
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));
  const { t } = useTranslation(['translation', 'agent']);

  // All hooks must be called unconditionally before any conditional return.
  const [visibleCount, setVisibleCount] = React.useState(IS_TEST_ENV ? allSections.length : INITIAL_SECTION_COUNT);
  React.useEffect(() => {
    if (IS_TEST_ENV) return;
    if (query.trim()) return; // don't advance deferred loading while searching
    if (preference === undefined || visibleCount >= allSections.length) return;
    const id = requestIdleCallback(() => {
      setVisibleCount((c) => Math.min(c + 4, allSections.length));
    }, { timeout: 500 });
    return () => {
      cancelIdleCallback(id);
    };
  }, [visibleCount, preference, query]);

  // ── Search mode ───────────────────────────────────────────────────
  if (query.trim()) {
    if (preference === undefined) {
      return <Skeleton variant='text' width={200} height={24} sx={{ mt: 2 }} />;
    }
    const hits = collectSearchHits(query, platform, t);
    if (hits.length === 0) {
      return (
        <Typography color='text.secondary' sx={{ mt: 2 }}>
          {t('Preference.SearchNoResult', { defaultValue: 'No settings found for "{{query}}"', query })}
        </Typography>
      );
    }
    return (
      <>
        {hits.map(({ item, section }, index) => {
          const sectionTitle = t(section.titleKey, section.ns ? { ns: section.ns } : undefined);
          const itemKey = 'key' in item ? item.key : ('handler' in item ? `action-${item.handler}-${index}` : `item-${index}`);
          return (
            <React.Fragment key={itemKey}>
              {index > 0 && <Divider />}
              <SearchSectionLabel>
                <HighlightText text={sectionTitle} query={query} />
              </SearchSectionLabel>
              <ItemRenderer
                item={item}
                preference={preference}
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

  // ── Normal (non-search) mode ──────────────────────────────────────

  if (preference === undefined) {
    // Show skeletons for all sections while preferences load — with refs attached for sidebar nav
    return (
      <>
        {allSections.map((s) => <DeferredSectionSkeleton key={s.id} sectionRef={sectionRefs.get(s.id)} />)}
      </>
    );
  }

  return (
    <>
      {allSections.slice(0, visibleCount).map((section) => {
        const reference = sectionRefs.get(section.id) ?? React.createRef<HTMLSpanElement>();
        // If the section provides a custom component, use it instead of the schema renderer
        if (section.CustomSectionComponent) {
          const CustomComponent = section.CustomSectionComponent;
          return <CustomComponent key={section.id} sectionRef={reference} onNeedsRestart={onNeedsRestart} />;
        }
        return (
          <SectionRenderer
            key={section.id}
            section={section}
            sectionRef={reference}
            preference={preference}
            platform={platform}
            onNeedsRestart={onNeedsRestart}
          />
        );
      })}
      {/* Skeleton placeholders for deferred sections — refs attached so sidebar nav still works */}
      {allSections.slice(visibleCount).map((section) => <DeferredSectionSkeleton key={section.id} sectionRef={sectionRefs.get(section.id)} />)}
    </>
  );
}
