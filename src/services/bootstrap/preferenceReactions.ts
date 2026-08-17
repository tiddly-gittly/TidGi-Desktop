import { WikiChannel } from '@/constants/channels';
import type { IAnalyticsService } from '@services/analytics/interface';
import { container } from '@services/container';
import { i18n } from '@services/libs/i18n';
import { requestChangeLanguage } from '@services/libs/i18n/requestChangeLanguage';
import type { INotificationService } from '@services/notifications/interface';
import type { IPreferenceReactionHandler, IPreferences, IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { DARK_LIGHT_CHANGE_ACTIONS_TAG, type IThemeService } from '@services/theme/interface';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { isWikiWorkspace, type IWorkspaceService } from '@services/workspaces/interface';
import { dialog, nativeTheme } from 'electron';

export function initializePreferenceReactions(): void {
  const analyticsService = container.get<IAnalyticsService>(serviceIdentifier.Analytics);
  const notificationService = container.get<INotificationService>(serviceIdentifier.NotificationService);
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const handler: IPreferenceReactionHandler = async <K extends keyof IPreferences>(key: K, value: IPreferences[K]) => {
    if (key === 'analyticsEnabled' || key === 'analyticsHost' || key === 'analyticsHostname' || key === 'analyticsSiteId') {
      if (key === 'analyticsEnabled' && value === false) {
        await analyticsService.clearPendingEvents();
      }
      void analyticsService.track('preferences.analytics_updated', {
        field: key,
        enabled: key === 'analyticsEnabled' ? Boolean(value) : undefined,
      });
    }

    if (key.startsWith('pauseNotifications')) {
      await notificationService.updatePauseNotificationsInfo();
    }

    await windowService.reactWhenPreferencesChanged(key, value);

    switch (key) {
      case 'themeSource': {
        nativeTheme.themeSource = value as IPreferences['themeSource'];
        return;
      }
      case 'language': {
        await requestChangeLanguage(value as string);
        return;
      }
      default:
        return;
    }
  };

  preferenceService.setReactionHandler(handler);
  preferenceService.setResetWithConfirmHandler(async () => {
    const preferenceWindow = windowService.get(WindowNames.preferences);
    if (preferenceWindow === undefined) return;
    const { response } = await dialog.showMessageBox(preferenceWindow, {
      type: 'question',
      buttons: [i18n.t('Preference.ResetNow'), i18n.t('Cancel')],
      message: i18n.t('Preference.Reset'),
      cancelId: 1,
    });
    if (response === 0) {
      await preferenceService.reset();
      await windowService.requestRestart();
    }
  });
}

export function initializeThemeReactions(): void {
  const themeService = container.get<IThemeService>(serviceIdentifier.ThemeService);
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  themeService.setActiveWikiThemeUpdater(async ({ shouldUseDarkColors }) => {
    const workspaces = await workspaceService.getWorkspacesAsList();
    const backgroundColor = shouldUseDarkColors ? '#212121' : '#ffffff';
    const themeActionData = {
      'dark-mode': shouldUseDarkColors ? 'yes' : 'no',
    };

    await Promise.all(
      workspaces.filter((workspace) => isWikiWorkspace(workspace) && !workspace.isSubWiki && !workspace.hibernated).map(async (workspace) => {
        await wikiService.wikiOperationInServer(WikiChannel.invokeActionsByTag, workspace.id, [
          DARK_LIGHT_CHANGE_ACTIONS_TAG,
          themeActionData,
        ]);

        await wikiService.wikiOperationInBrowser(WikiChannel.invokeActionsByTag, workspace.id, [
          DARK_LIGHT_CHANGE_ACTIONS_TAG,
          themeActionData,
        ]);

        viewService.forEachView((view, workspaceID) => {
          if (workspaceID === workspace.id) {
            view.setBackgroundColor(backgroundColor);
          }
        });
      }),
    );
  });
}
