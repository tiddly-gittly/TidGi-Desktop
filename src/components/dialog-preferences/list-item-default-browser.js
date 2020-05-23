import React, { useState, useEffect, useCallback } from 'react';
import semver from 'semver';

import Button from '@material-ui/core/Button';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';

import ChevronRightIcon from '@material-ui/icons/ChevronRight';

import connectComponent from '../../helpers/connect-component';

import { requestOpenInBrowser } from '../../senders';

const ListItemDefaultBrowser = () => {
  const [isDefault, setIsDefault] = useState(false);

  const isWindows10 = window.process.platform === 'win32' && semver.gt(window.require('electron').remote.require('os').release(), '10.0.0');

  const recheckIsDefault = useCallback(
    () => {
      // Electron protocol API doesn't work with Windows 10
      // So check with regedit
      if (isWindows10) {
        // https://stackoverflow.com/questions/32354861/how-to-find-the-default-browser-via-the-registry-on-windows-10
        const protocolName = 'http'; // https works as well
        const userChoicePath = `HKCU\\SOFTWARE\\Microsoft\\Windows\\Shell\\Associations\\URLAssociations\\${protocolName}\\UserChoice`;
        window.require('electron').remote.require('regedit').list([userChoicePath], (err, result) => {
          try {
            setIsDefault(!err && result[userChoicePath].values.ProgId.value === 'Singlebox');
          } catch (tryErr) {
            // eslint-disable-next-line no-console
            console.log(tryErr);
            setIsDefault(false);
          }
        });
        return;
      }

      setIsDefault(window.require('electron').app.isDefaultProtocolClient('http'));
    },
    [isWindows10],
  );

  // recheck every 1 minutes
  useEffect(() => {
    recheckIsDefault();
    const timer = setInterval(() => {
      recheckIsDefault();
    }, 60 * 1000);
    return () => {
      clearInterval(timer);
    };
  }, [recheckIsDefault]);

  if (isDefault) {
    return (
      <ListItem>
        <ListItemText secondary="Singlebox is your default browser." />
      </ListItem>
    );
  }

  const sharedListItemText = (
    <ListItemText primary="Default browser" secondary="Make Singlebox the default browser." />
  );

  // open ms-settings on Windows 10
  // as Windows 10 doesn't allow changing default app programmatically
  if (isWindows10) {
    return (
      // https://docs.microsoft.com/en-us/windows/uwp/launch-resume/launch-settings-app
      <ListItem button onClick={() => requestOpenInBrowser('ms-settings:defaultapps')}>
        {sharedListItemText}
        <ChevronRightIcon color="action" />
      </ListItem>
    );
  }

  return (
    <ListItem>
      {sharedListItemText}
      <Button
        variant="outlined"
        size="small"
        color="default"
        onClick={() => {
          window.require('electron').app.setAsDefaultProtocolClient('http');
          window.require('electron').app.setAsDefaultProtocolClient('https');
          recheckIsDefault();
        }}
      >
        Make default
      </Button>
    </ListItem>
  );
};

export default connectComponent(
  ListItemDefaultBrowser,
  null,
  null,
  null,
);
