import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { AccordionDetails, Divider, Tooltip } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import defaultIcon from '../../images/default-icon.png';

import { wikiPictureExtensions } from '@/constants/fileNames';
import { IWorkspace } from '@services/workspaces/interface';
import { Avatar, AvatarFlex, AvatarLeft, AvatarPicture, AvatarRight, OptionsAccordion, OptionsAccordionSummary, PictureButton, TextField } from './styles';

interface AppearanceOptionsProps {
  workspace: IWorkspace;
  workspaceSetter: (newValue: IWorkspace) => void;
}

const getValidIconPath = (iconPath?: string | null): string => {
  if (typeof iconPath === 'string') {
    return `file:///${iconPath}`;
  }
  return defaultIcon;
};

export function AppearanceOptions(props: AppearanceOptionsProps): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = props;
  const { name, picturePath } = workspace;

  return (
    <OptionsAccordion defaultExpanded>
      <Tooltip title={t('EditWorkspace.ClickToExpand')}>
        <OptionsAccordionSummary expandIcon={<ExpandMoreIcon />}>
          {t('EditWorkspace.AppearanceOptions')}
        </OptionsAccordionSummary>
      </Tooltip>
      <AccordionDetails>
        <TextField
          id='outlined-full-width'
          label={t('EditWorkspace.Name')}
          helperText={t('EditWorkspace.NameDescription')}
          placeholder='Optional'
          value={name}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            workspaceSetter({ ...workspace, name: event.target.value });
          }}
        />
        <Divider />
        <AvatarFlex>
          <AvatarLeft>
            <Avatar transparentBackground={false}>
              <AvatarPicture alt='Icon' src={getValidIconPath(picturePath)} />
            </Avatar>
          </AvatarLeft>
          <AvatarRight>
            <Tooltip title={wikiPictureExtensions.join(', ')} placement='top'>
              <PictureButton
                variant='outlined'
                size='small'
                onClick={async () => {
                  const filePaths = await window.service.native.pickFile([{ name: 'Images', extensions: wikiPictureExtensions }]);
                  if (filePaths.length > 0) {
                    workspaceSetter({ ...workspace, picturePath: filePaths[0] });
                  }
                }}
              >
                {t('EditWorkspace.SelectLocal')}
              </PictureButton>
            </Tooltip>

            <Tooltip title={t('EditWorkspace.NoRevert') ?? ''} placement='bottom'>
              <PictureButton
                onClick={() => {
                  workspaceSetter({ ...workspace, picturePath: null });
                }}
                disabled={!picturePath}
              >
                {t('EditWorkspace.ResetDefaultIcon')}
              </PictureButton>
            </Tooltip>
          </AvatarRight>
        </AvatarFlex>
      </AccordionDetails>
    </OptionsAccordion>
  );
}
