import { Autocomplete, Button, Fab, Paper, TextField, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import styled, { css } from 'styled-components';

export const CreateContainer = styled(Paper)`
  padding: 10px;
  margin-top: 10px;
  background-color: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.primary};
`;
export const LocationPickerContainer = styled.div`
  display: flex;
  flex-direction: row;
  margin-bottom: 10px;
  background-color: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.primary};
`;
export const LocationPickerInput = styled(TextField)`
  background-color: ${({ theme }) => theme.palette.background.paper};
`;
LocationPickerInput.defaultProps = {
  fullWidth: true,
  variant: 'standard',
};
export const LocationPickerButton = styled(Button)`
  white-space: nowrap;
  width: fit-content;
`;
export const CloseButton = styled(Button)`
  ${({ disabled }) =>
  disabled === true
    ? ''
    : css`
          white-space: nowrap;
        `}
  width: 100%;
  background-color: ${({ theme }) => theme.palette.secondary[theme.palette.mode]};
`;
LocationPickerButton.defaultProps = {
  variant: 'contained',
  color: 'inherit',
};
export const SoftLinkToMainWikiSelect = styled(LocationPickerInput)`
  width: 100%;
`;
SoftLinkToMainWikiSelect.defaultProps = { select: true };
export const SubWikiTagAutoComplete = styled(Autocomplete)``;
SubWikiTagAutoComplete.defaultProps = {
  freeSolo: true,
};
export const WikiLocation = styled(Typography)`
  direction: rtl;
  text-transform: none;
  margin-left: 5px;
  margin-right: 5px;
`;
WikiLocation.defaultProps = { variant: 'body2', noWrap: true, display: 'inline', align: 'center' };

export function ReportErrorButton(props: { message: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <Tooltip title={(t('Dialog.ReportBugDetail') ?? '') + (t('Menu.ReportBugViaGithub') ?? '')}>
      <Button
        color='secondary'
        onClick={() => {
          const error = new Error(props.message);
          error.stack = 'ReportErrorButton';
          void window.service.native.openNewGitHubIssue(error);
        }}
      >
        {t('Dialog.ReportBug')}
      </Button>
    </Tooltip>
  );
}

const AbsoluteFab = styled(Fab)`
  position: fixed;
  right: 10px;
  bottom: 10px;
  color: rgba(0, 0, 0, 0.2);
  font-size: 10px;
`;
export function ReportErrorFabButton(props: { message: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <Tooltip title={(t('Dialog.ReportBugDetail') ?? '') + (t('Menu.ReportBugViaGithub') ?? '')}>
      <AbsoluteFab
        color='default'
        onClick={() => {
          const error = new Error(props.message);
          error.stack = 'ReportErrorButton';
          void window.service.native.openNewGitHubIssue(error);
        }}
      >
        {t('Dialog.ReportBug')}
      </AbsoluteFab>
    </Tooltip>
  );
}
