import type { ComponentType } from 'react';
import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import Paper from '@material-ui/core/Paper';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';

const Container: ComponentType<{}> = styled(Paper)`
  padding: 10px;
`;

interface Props {
  isCreateMainWorkspace: boolean;
  // @ts-expect-error ts-migrate(7051) FIXME: Parameter has a name but no type. Did you mean 'ar... Remove this comment to see the full error message
  isCreateMainWorkspaceSetter: (boolean) => void;
}

export default function Description({ isCreateMainWorkspace, isCreateMainWorkspaceSetter }: Props) {
  const { t } = useTranslation();
  const label = isCreateMainWorkspace ? t('AddWorkspace.MainWorkspace') : t('AddWorkspace.SubWorkspace');
  const description = isCreateMainWorkspace ? t('AddWorkspace.MainWorkspaceDescription') : t('AddWorkspace.SubWorkspaceDescription');
  return (
    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Container elevation={0} square>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <FormControlLabel
        // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        control={<Switch checked={isCreateMainWorkspace} onChange={(event) => isCreateMainWorkspaceSetter(event.target.checked)} />}
        label={label}
      />
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Typography variant="body2" display="inline">
        {description}
      </Typography>
    </Container>
  );
}
