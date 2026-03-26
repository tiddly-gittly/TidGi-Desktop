import AccountTreeIcon from '@mui/icons-material/AccountTree';
import BrushIcon from '@mui/icons-material/Brush';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import StorageIcon from '@mui/icons-material/Storage';
import type { SvgIconTypeMap } from '@mui/material';
import type { OverridableComponent } from '@mui/material/OverridableComponent';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';

export enum WorkspaceSections {
  appearance = 'appearance',
  saveAndSync = 'saveAndSync',
  server = 'server',
  subWiki = 'subWiki',
  misc = 'misc',
}

export type IWorkspaceSectionRecord<SectionTitleElement = HTMLSpanElement> = Record<
  WorkspaceSections,
  {
    Icon: OverridableComponent<SvgIconTypeMap<unknown>>;
    hidden?: boolean;
    ref: React.RefObject<SectionTitleElement | null>;
    text: string;
  }
>;

export function useWorkspaceSections<SectionTitleElement = HTMLSpanElement>(options?: {
  hideServer?: boolean;
  hideSubWiki?: boolean;
}): IWorkspaceSectionRecord<SectionTitleElement> {
  const { t } = useTranslation();
  return {
    [WorkspaceSections.appearance]: {
      text: t('EditWorkspace.AppearanceOptions'),
      Icon: BrushIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [WorkspaceSections.saveAndSync]: {
      text: t('EditWorkspace.SaveAndSyncOptions'),
      Icon: CloudSyncIcon,
      ref: useRef<SectionTitleElement>(null),
    },
    [WorkspaceSections.server]: {
      text: t('EditWorkspace.ServerOptions'),
      Icon: StorageIcon,
      ref: useRef<SectionTitleElement>(null),
      hidden: options?.hideServer,
    },
    [WorkspaceSections.subWiki]: {
      text: t('EditWorkspace.IsSubWorkspace'),
      Icon: AccountTreeIcon,
      ref: useRef<SectionTitleElement>(null),
      hidden: options?.hideSubWiki,
    },
    [WorkspaceSections.misc]: {
      text: t('EditWorkspace.MiscOptions'),
      Icon: MoreHorizIcon,
      ref: useRef<SectionTitleElement>(null),
    },
  };
}
