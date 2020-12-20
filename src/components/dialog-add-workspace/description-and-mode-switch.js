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
  isCreateMainWorkspaceSetter: (boolean) => void;
}

export default function Description({ isCreateMainWorkspace, isCreateMainWorkspaceSetter }: Props) {
  const { t } = useTranslation();
  const label = isCreateMainWorkspace ? t('AddWorkspace.MainWorkspace') : t('AddWorkspace.SubWorkspace');
  const description = isCreateMainWorkspace
    ? t('AddWorkspace.MainWorkspaceDescription')
    : t('AddWorkspace.SubWorkspaceDescription');
  return (
    <Container elevation={0} square>
      <FormControlLabel
        control={
          <Switch
            checked={isCreateMainWorkspace}
            onChange={event => isCreateMainWorkspaceSetter(event.target.checked)}
          />
        }
        label={label}
      />
      <Typography variant="body2" display="inline">
        {description}
      </Typography>
    </Container>
  );
}
