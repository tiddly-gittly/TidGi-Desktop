/**
 * Schema-driven renderer for workspace settings — mirrors SchemaRenderer.tsx for Preferences.
 * Renders IGenericSectionDefinition items by reading from workspace state and writing via workspaceSetter.
 */
import { Divider, List, Skeleton, Switch, TextField } from '@mui/material';
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
import { Paper, SectionTitle } from '../Preferences/PreferenceComponents';
import { getCustomComponent } from './workspaceCustomComponentRegistry';

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
}: {
  item: IGenericBooleanItem;
  workspace: IWikiWorkspace;
  workspaceSetter: (ws: IWikiWorkspace, needsRestart?: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = (workspace as unknown as Record<string, unknown>)[item.key] as boolean;
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
        primary={t(item.titleKey, item.ns ? { ns: item.ns } : undefined)}
        secondary={item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined}
      />
    </ListItem>
  );
}

function EnumItem({
  item,
  workspace,
  workspaceSetter,
}: {
  item: IGenericEnumItem;
  workspace: IWikiWorkspace;
  workspaceSetter: (ws: IWikiWorkspace, needsRestart?: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = (workspace as unknown as Record<string, unknown>)[item.key] as string;
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
        primary={t(item.titleKey, item.ns ? { ns: item.ns } : undefined)}
        secondary={item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined}
      />
    </ListItem>
  );
}

function NumberItem({
  item,
  workspace,
  workspaceSetter,
}: {
  item: IGenericNumberItem;
  workspace: IWikiWorkspace;
  workspaceSetter: (ws: IWikiWorkspace, needsRestart?: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = (workspace as unknown as Record<string, unknown>)[item.key] as number;
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
        primary={t(item.titleKey, item.ns ? { ns: item.ns } : undefined)}
        secondary={item.descriptionKey ? t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined) : undefined}
      />
    </ListItem>
  );
}

function StringItem({
  item,
  workspace,
  workspaceSetter,
}: {
  item: IGenericStringItem;
  workspace: IWikiWorkspace;
  workspaceSetter: (ws: IWikiWorkspace, needsRestart?: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = ((workspace as unknown as Record<string, unknown>)[item.key] as string) ?? '';
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
}: {
  item: GenericSettingItemDefinition;
  onNeedsRestart: () => void;
  platform: string | undefined;
  workspace: IWikiWorkspace;
  workspaceSetter: (ws: IWikiWorkspace, needsRestart?: boolean) => void;
}): React.JSX.Element | null {
  if (item.type === 'divider') return <Divider />;
  if ('platform' in item && !matchesPlatform(item.platform, platform)) return null;

  switch (item.type) {
    case 'preference-boolean':
      return <BooleanItem item={item} workspace={workspace} workspaceSetter={workspaceSetter} />;
    case 'preference-enum':
      return <EnumItem item={item} workspace={workspace} workspaceSetter={workspaceSetter} />;
    case 'preference-number':
      return <NumberItem item={item} workspace={workspace} workspaceSetter={workspaceSetter} />;
    case 'preference-string':
      return <StringItem item={item} workspace={workspace} workspaceSetter={workspaceSetter} />;
    case 'action':
      return null;
    case 'custom':
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
}: IAllWorkspaceSectionsRendererProps): React.JSX.Element {
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));

  const visibleSections = React.useMemo(
    () => allWorkspaceSections.filter((s) => !hiddenSections?.has(s.id) && !s.hidden),
    [hiddenSections],
  );

  const [visibleCount, setVisibleCount] = React.useState(IS_TEST_ENV ? visibleSections.length : INITIAL_SECTION_COUNT);
  React.useEffect(() => {
    if (IS_TEST_ENV) return;
    if (visibleCount >= visibleSections.length) return;
    const id = requestIdleCallback(() => {
      setVisibleCount((c) => Math.min(c + 3, visibleSections.length));
    }, { timeout: 500 });
    return () => {
      cancelIdleCallback(id);
    };
  }, [visibleCount, visibleSections.length]);

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
