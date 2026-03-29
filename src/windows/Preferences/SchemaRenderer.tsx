import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Divider, List, ListItemButton, Skeleton, Switch, TextField } from '@mui/material';
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
import { Paper, SectionTitle } from './PreferenceComponents';

// ─── Platform filter ─────────────────────────────────────────────────

function matchesPlatform(condition: PlatformCondition | undefined, platform: string | undefined): boolean {
  if (condition === undefined || platform === undefined) return true;
  if (condition === 'darwin') return platform === 'darwin';
  if (condition === '!darwin') return platform !== 'darwin';
  if (condition === 'win32') return platform === 'win32';
  return true;
}

// ─── Item renderers ──────────────────────────────────────────────────

function BooleanItem({
  item,
  preference,
  onNeedsRestart,
}: {
  item: IBooleanPreferenceItem;
  onNeedsRestart: () => void;
  preference: IPreferences;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const value = preference[item.key] as boolean;
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
        primary={t(item.titleKey, item.ns ? { ns: item.ns } : undefined)}
        secondary={item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined}
      />
    </ListItem>
  );
}

function EnumItem({
  item,
  preference,
  onNeedsRestart,
}: {
  item: IEnumPreferenceItem;
  onNeedsRestart: () => void;
  preference: IPreferences;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const value = preference[item.key] as string;

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
        primary={t(item.titleKey, item.ns ? { ns: item.ns } : undefined)}
        secondary={item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined}
      />
    </ListItem>
  );
}

function NumberItem({
  item,
  preference,
  onNeedsRestart,
}: {
  item: INumberPreferenceItem;
  onNeedsRestart: () => void;
  preference: IPreferences;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const value = preference[item.key] as number;
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
        primary={t(item.titleKey, item.ns ? { ns: item.ns } : undefined)}
        secondary={item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined}
      />
    </ListItem>
  );
}

function StringItem({
  item,
  preference,
  onNeedsRestart,
}: {
  item: IStringPreferenceItem;
  onNeedsRestart: () => void;
  preference: IPreferences;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const value = (preference[item.key] as string) ?? '';
  return (
    <ListItem>
      <ListItemText
        primary={t(item.titleKey, item.ns ? { ns: item.ns } : undefined)}
        secondary={item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined}
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
}: {
  item: IStringArrayPreferenceItem;
  onNeedsRestart: () => void;
  preference: IPreferences;
}): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  const value = (preference[item.key] as string[]) ?? [];
  const [localValue, setLocalValue] = React.useState(value.join('\n'));
  React.useEffect(() => {
    setLocalValue(value.join('\n'));
  }, [value.join('\n')]);

  return (
    <ListItem>
      <ListItemText
        primary={t(item.titleKey, item.ns ? { ns: item.ns } : undefined)}
        secondary={item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined}
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

function ActionItem({ item }: { item: IActionItem }): React.JSX.Element {
  const { t } = useTranslation(['translation', 'agent']);
  return (
    <ListItemButton
      onClick={async () => {
        const handler = getActionHandler(item.handler);
        await handler(...(item.args ?? []));
      }}
    >
      <ListItemText
        primary={t(item.titleKey, item.ns ? { ns: item.ns } : undefined)}
        secondary={item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined}
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
}: {
  item: PreferenceItemDefinition;
  onNeedsRestart: () => void;
  platform: string | undefined;
  preference: IPreferences;
}): React.JSX.Element | null {
  if (item.type === 'divider') return <Divider />;
  if ('platform' in item && !matchesPlatform(item.platform, platform)) return null;

  switch (item.type) {
    case 'preference-boolean':
      return <BooleanItem item={item} preference={preference} onNeedsRestart={onNeedsRestart} />;
    case 'preference-enum':
      return <EnumItem item={item} preference={preference} onNeedsRestart={onNeedsRestart} />;
    case 'preference-number':
      return <NumberItem item={item} preference={preference} onNeedsRestart={onNeedsRestart} />;
    case 'preference-string':
      return <StringItem item={item} preference={preference} onNeedsRestart={onNeedsRestart} />;
    case 'preference-string-array':
      return <StringArrayItem item={item} preference={preference} onNeedsRestart={onNeedsRestart} />;
    case 'action':
      return <ActionItem item={item} />;
    case 'custom':
      return <CustomItemWrapper item={item} onNeedsRestart={onNeedsRestart} />;
  }
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

export function AllSectionsRenderer({ onNeedsRestart, sectionRefs }: IAllSectionsRendererProps): React.JSX.Element {
  const preference = usePreferenceObservable();
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));

  // Render first INITIAL_SECTION_COUNT sections synchronously.
  // Remaining sections are appended in idle-time batches to keep the first paint fast.
  const [visibleCount, setVisibleCount] = React.useState(IS_TEST_ENV ? allSections.length : INITIAL_SECTION_COUNT);
  React.useEffect(() => {
    if (IS_TEST_ENV) return;
    if (preference === undefined || visibleCount >= allSections.length) return;
    const id = requestIdleCallback(() => {
      setVisibleCount((c) => Math.min(c + 4, allSections.length));
    }, { timeout: 500 });
    return () => {
      cancelIdleCallback(id);
    };
  }, [visibleCount, preference]);

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
