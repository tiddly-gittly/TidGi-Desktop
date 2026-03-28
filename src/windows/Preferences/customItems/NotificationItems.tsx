import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { ListItemButton } from '@mui/material';
import { Trans, useTranslation } from 'react-i18next';
import semver from 'semver';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { Link } from '../PreferenceComponents';

export function NotificationTestItem(): React.JSX.Element | null {
  const { t } = useTranslation();
  const platformAndVersion = usePromiseValue(
    async () => await Promise.all([window.service.context.get('platform'), window.service.context.get('oSVersion')]),
    [undefined, undefined] as [string | undefined, string | undefined],
  );
  const platform = platformAndVersion?.[0];
  const oSVersion = platformAndVersion?.[1];

  return (
    <>
      <ListItemButton
        onClick={() => {
          void window.service.notification.show({
            title: t('Preference.TestNotification'),
            body: t('Preference.ItIsWorking'),
          });
        }}
      >
        <ListItemText
          primary={t('Preference.TestNotification')}
          secondary={(() => {
            if (platform === 'darwin' && oSVersion !== undefined && semver.gte(oSVersion, '10.15.0')) {
              return (
                <Trans t={t} i18nKey='Preference.TestNotificationDescription'>
                  <span>
                    If notifications dont show up, make sure you enable notifications in
                    <b>macOS Preferences → Notifications → TidGi</b>.
                  </span>
                </Trans>
              );
            }
          })()}
        />
        <ChevronRightIcon color='action' />
      </ListItemButton>
    </>
  );
}

export function NotificationHelpTextItem(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <ListItem>
      <ListItemText
        secondary={
          <Trans t={t} i18nKey='Preference.HowToEnableNotifications'>
            <span>
              TidGi supports notifications out of the box. But for some cases, to receive notifications, you will need to manually configure additional web app settings.
            </span>
            <Link
              onClick={async () => {
                await window.service.native.openURI('https://github.com/atomery/webcatalog/wiki/How-to-Enable-Notifications-in-Web-Apps');
              }}
              onKeyDown={(event: React.KeyboardEvent<HTMLSpanElement>) => {
                if (event.key !== 'Enter') return;
                void window.service.native.openURI('https://github.com/atomery/webcatalog/wiki/How-to-Enable-Notifications-in-Web-Apps');
              }}
            >
              Learn more
            </Link>
            <span>.</span>
          </Trans>
        }
      />
    </ListItem>
  );
}
