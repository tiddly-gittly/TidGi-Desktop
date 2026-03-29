import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import type { IGenericSectionDefinition } from '@services/preferences/definitions/types';

export const miscSection: IGenericSectionDefinition = {
  id: 'misc',
  titleKey: 'EditWorkspace.MiscOptions',
  Icon: MoreHorizIcon,
  items: [
    {
      type: 'preference-boolean',
      key: 'hibernateWhenUnused',
      titleKey: 'EditWorkspace.HibernateTitle',
      descriptionKey: 'EditWorkspace.HibernateDescription',
    },
    {
      type: 'preference-boolean',
      key: 'disableNotifications',
      titleKey: 'EditWorkspace.DisableNotificationTitle',
      descriptionKey: 'EditWorkspace.DisableNotification',
    },
    {
      type: 'preference-boolean',
      key: 'disableAudio',
      titleKey: 'EditWorkspace.DisableAudioTitle',
      descriptionKey: 'EditWorkspace.DisableAudio',
    },
    { type: 'divider' },
    {
      type: 'preference-boolean',
      key: 'enableFileSystemWatch',
      titleKey: 'EditWorkspace.EnableFileSystemWatchTitle',
      descriptionKey: 'EditWorkspace.EnableFileSystemWatchDescription',
      needsRestart: true,
    },
    { type: 'divider' },
    {
      type: 'custom',
      componentId: 'workspace.lastUrl',
      titleKey: 'EditWorkspace.LastVisitState',
    },
  ],
};
