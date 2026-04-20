/**
 * Schema-driven renderer for workspace settings — mirrors SchemaRenderer.tsx for Preferences.
 * Renders IGenericSectionDefinition items by reading from workspace state and writing via workspaceSetter.
 */
import { Divider, List, Skeleton, Switch, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import i18next from 'i18next';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import type {
  GenericSettingItemDefinition,
  ICustomItem,
  IGenericBooleanItem,
  IGenericEnumItem,
  IGenericNumberItem,
  IGenericSectionDefinition,
  IGenericStringItem,
  PlatformCondition,
} from '@services/preferences/definitions/types';
import { allWorkspaceSections } from '@services/workspaces/definitions/registry';
import type { IWikiWorkspace } from '@services/workspaces/interface';
import { HighlightText } from '../Preferences/HighlightText';
import { Paper, SectionTitle } from '../Preferences/PreferenceComponents';
import { getCustomComponent } from './workspaceCustomComponentRegistry';

// ─── Helpers ─────────────────────────────────────────────────────

/** Return the English translation for a key — used for search matching. */
function txEn(key: string, ns?: string): string {
  try {
    return ns ? (i18next.t(key, { lng: 'en', ns })) : (i18next.t(key, { lng: 'en' }));
  } catch {
    return '';
  }
}

const SearchSectionLabel = styled(Typography)`
  color: ${({ theme }) => theme.palette.text.secondary};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 4px;
`;

// ─── Platform filter ─────────────────────────────────────────────────

function matchesPlatform(condition: PlatformCondition | undefined, platform: string | undefined): boolean {
  if (condition === undefined || platform === undefined) return true;
  if (condition === 'darwin') return platform === 'darwin';
  if (condition === '!darwin') return platform !== 'darwin';
  if (condition === 'win32') return platform === 'win32';
  return true;
}

function toKebabCase(value: string): string {
  return value.replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// ─── Workspace item renderers ────────────────────────────────────────

function BooleanItem({
  item,
  workspace,
  workspaceSetter,
  query = '',
}: {
  item: IGenericBooleanItem;
  query?: string;
  workspace: IWikiWorkspace;
  workspaceSetter: (ws: IWikiWorkspace, needsRestart?: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = (workspace as unknown as Record<string, unknown>)[item.key] as boolean;
  const primaryText = t(item.titleKey, item.ns ? { ns: item.ns } : undefined);
  const secondaryText = item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined;
  return (
    <ListItem
      secondaryAction={
        <Switch
          edge='end'
          color='primary'
          checked={value ?? false}
          data-testid={`${toKebabCase(item.key)}-switch`}
          onChange={(event) => {
            workspaceSetter({ ...workspace, [item.key]: event.target.checked }, item.needsRestart);
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
  workspace,
  workspaceSetter,
  query = '',
}: {
  item: IGenericEnumItem;
  query?: string;
  workspace: IWikiWorkspace;
  workspaceSetter: (ws: IWikiWorkspace, needsRestart?: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = (workspace as unknown as Record<string, unknown>)[item.key] as string;
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
            workspaceSetter({ ...workspace, [item.key]: event.target.value }, item.needsRestart);
          }}
          slotProps={{ select: { native: true } }}
          sx={{ minWidth: 120 }}
        >
          {item.enumValues.map((v, index) => <option key={v} value={v}>{t(item.enumNames[index])}</option>)}
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
  workspace,
  workspaceSetter,
  query = '',
}: {
  item: IGenericNumberItem;
  query?: string;
  workspace: IWikiWorkspace;
  workspaceSetter: (ws: IWikiWorkspace, needsRestart?: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = (workspace as unknown as Record<string, unknown>)[item.key] as number;
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
              workspaceSetter({ ...workspace, [item.key]: newValue }, item.needsRestart);
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
  workspace,
  workspaceSetter,
  query = '',
}: {
  item: IGenericStringItem;
  query?: string;
  workspace: IWikiWorkspace;
  workspaceSetter: (ws: IWikiWorkspace, needsRestart?: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = ((workspace as unknown as Record<string, unknown>)[item.key] as string) ?? '';
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
          workspaceSetter({ ...workspace, [item.key]: event.target.value }, item.needsRestart);
        }}
        sx={{ minWidth: 150 }}
      />
    </ListItem>
  );
}

function CustomItemWrapper({
  item,
  onNeedsRestart,
}: {
  item: ICustomItem;
  onNeedsRestart: () => void;
}): React.JSX.Element | null {
  const Component = getCustomComponent(item.componentId);
  if (!Component) {
    console.warn(`Workspace custom component not registered: ${item.componentId}`);
    return null;
  }
  return <Component onNeedsRestart={onNeedsRestart} />;
}

// ─── Workspace item dispatcher ───────────────────────────────────────

function WorkspaceItemRenderer({
  item,
  workspace,
  workspaceSetter,
  platform,
  onNeedsRestart,
  query = '',
}: {
  item: GenericSettingItemDefinition;
  onNeedsRestart: () => void;
  platform: string | undefined;
  query?: string;
  workspace: IWikiWorkspace;
  workspaceSetter: (ws: IWikiWorkspace, needsRestart?: boolean) => void;
}): React.JSX.Element | null {
  if (item.type === 'divider') return query ? null : <Divider />;
  if ('platform' in item && !matchesPlatform(item.platform, platform)) return null;

  switch (item.type) {
    case 'preference-boolean':
      return <BooleanItem item={item} workspace={workspace} workspaceSetter={workspaceSetter} query={query} />;
    case 'preference-enum':
      return <EnumItem item={item} workspace={workspace} workspaceSetter={workspaceSetter} query={query} />;
    case 'preference-number':
      return <NumberItem item={item} workspace={workspace} workspaceSetter={workspaceSetter} query={query} />;
    case 'preference-string':
      return <StringItem item={item} workspace={workspace} workspaceSetter={workspaceSetter} query={query} />;
    case 'action':
      // action items not supported in workspace settings — skip
      return null;
    case 'custom':
      // In search mode: show a read-only info card so the user can navigate there.
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

// ─── Section renderer ────────────────────────────────────────────────

interface IWorkspaceSectionRendererProps {
  onNeedsRestart: () => void;
  platform: string | undefined;
  section: IGenericSectionDefinition;
  sectionRef: React.RefObject<HTMLSpanElement | null>;
  workspace: IWikiWorkspace;
  workspaceSetter: (ws: IWikiWorkspace, needsRestart?: boolean) => void;
}

export function WorkspaceSectionRenderer({
  section,
  sectionRef,
  workspace,
  workspaceSetter,
  platform,
  onNeedsRestart,
}: IWorkspaceSectionRendererProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle ref={sectionRef}>
        {t(section.titleKey, section.ns ? { ns: section.ns } : undefined)}
      </SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {section.items.map((item, index) => (
            <WorkspaceItemRenderer
              key={item.type === 'divider' ? `divider-${index}` : ('key' in item ? item.key : `item-${index}`)}
              item={item}
              workspace={workspace}
              workspaceSetter={workspaceSetter}
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

interface IAllWorkspaceSectionsRendererProps {
  onNeedsRestart: () => void;
  /** When provided, renders a flat filtered search-results view instead of the full sections layout. */
  query?: string;
  sectionRefs: Map<string, React.RefObject<HTMLSpanElement | null>>;
  workspace: IWikiWorkspace;
  workspaceSetter: (ws: IWikiWorkspace, needsRestart?: boolean) => void;
  /** Section IDs to hide (e.g. server for sub-wikis) */
  hiddenSections?: Set<string>;
}

function DeferredSectionSkeleton({ sectionRef }: { sectionRef?: React.RefObject<HTMLSpanElement | null> }): React.JSX.Element {
  return (
    <>
      <span ref={sectionRef} style={{ display: 'block', height: 0, overflow: 'hidden' }} />
      <Skeleton variant='text' width={160} height={20} sx={{ mb: 1, mt: 2 }} />
      <Skeleton variant='rounded' height={56} sx={{ mb: 0.5 }} />
      <Skeleton variant='rounded' height={56} sx={{ mb: 0.5 }} />
      <Skeleton variant='rounded' height={56} sx={{ mb: 2 }} />
    </>
  );
}

const INITIAL_SECTION_COUNT = 3;
const IS_TEST_ENV = process.env.NODE_ENV === 'test';

export function AllWorkspaceSectionsRenderer({
  onNeedsRestart,
  sectionRefs,
  workspace,
  workspaceSetter,
  hiddenSections,
  query = '',
}: IAllWorkspaceSectionsRendererProps): React.JSX.Element {
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));
  const { t } = useTranslation();

  const visibleSections = React.useMemo(
    () => allWorkspaceSections.filter((s) => !hiddenSections?.has(s.id) && !s.hidden),
    [hiddenSections],
  );

  // All hooks must be called unconditionally before any conditional return.
  const [visibleCount, setVisibleCount] = React.useState(IS_TEST_ENV ? visibleSections.length : INITIAL_SECTION_COUNT);
  React.useEffect(() => {
    if (IS_TEST_ENV) return;
    if (query.trim()) return; // don't advance deferred loading while searching
    if (visibleCount >= visibleSections.length) return;
    const id = requestIdleCallback(() => {
      setVisibleCount((c) => Math.min(c + 3, visibleSections.length));
    }, { timeout: 500 });
    return () => {
      cancelIdleCallback(id);
    };
  }, [visibleCount, visibleSections.length, query]);

  // ── Search mode ─────────────────────────────────────────────────
  if (query.trim()) {
    const q = query.toLowerCase().trim();
    const hits: Array<{ item: GenericSettingItemDefinition & { titleKey: string }; section: IGenericSectionDefinition }> = [];
    for (const section of visibleSections) {
      const sectionTitleEn = txEn(section.titleKey, section.ns).toLowerCase();
      const sectionTitleCurrent = t(section.titleKey, section.ns ? { ns: section.ns } : undefined).toLowerCase();
      const sectionKeyLower = section.titleKey.toLowerCase();
      for (const item of section.items) {
        if (item.type === 'divider') continue;
        if ('platform' in item && !matchesPlatform(item.platform, platform)) continue;
        if (!('titleKey' in item)) continue;
        const titleEn = txEn(item.titleKey, item.ns).toLowerCase();
        const titleCurrent = t(item.titleKey, item.ns ? { ns: item.ns } : undefined).toLowerCase();
        const descEn = item.descriptionKey ? txEn(item.descriptionKey, item.ns).toLowerCase() : '';
        const descCurrent = item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined).toLowerCase() : '';
        const titleKeyLower = item.titleKey.toLowerCase();
        if (
          titleEn.includes(q) ||
          titleCurrent.includes(q) ||
          descEn.includes(q) ||
          descCurrent.includes(q) ||
          titleKeyLower.includes(q) ||
          sectionTitleEn.includes(q) ||
          sectionTitleCurrent.includes(q) ||
          sectionKeyLower.includes(q)
        ) {
          hits.push({ item: item as GenericSettingItemDefinition & { titleKey: string }, section });
        }
      }
    }
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
              <WorkspaceItemRenderer
                item={item}
                workspace={workspace}
                workspaceSetter={workspaceSetter}
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

  // ── Normal (non-search) mode ─────────────────────────────────────

  return (
    <>
      {visibleSections.slice(0, visibleCount).map((section) => {
        const reference = sectionRefs.get(section.id) ?? React.createRef<HTMLSpanElement>();
        if (section.CustomSectionComponent) {
          const CustomComponent = section.CustomSectionComponent;
          return <CustomComponent key={section.id} sectionRef={reference} onNeedsRestart={onNeedsRestart} />;
        }
        return (
          <WorkspaceSectionRenderer
            key={section.id}
            section={section}
            sectionRef={reference}
            workspace={workspace}
            workspaceSetter={workspaceSetter}
            platform={platform}
            onNeedsRestart={onNeedsRestart}
          />
        );
      })}
      {visibleSections.slice(visibleCount).map((section) => <DeferredSectionSkeleton key={section.id} sectionRef={sectionRefs.get(section.id)} />)}
    </>
  );
}
