import { Autocomplete, Button, Fab, Paper, TextField, Tooltip, Typography } from '@mui/material';
import { css, styled } from '@mui/material/styles';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export const CreateContainer = styled(Paper)`
  padding: 10px;
  margin-top: 10px;
  background-color: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.primary};
`;
export const LocationPickerContainer = styled('div')`
  display: flex;
  flex-direction: row;
  margin-bottom: 10px;
  width: 100%;
  background-color: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.primary};
`;
export const LocationPickerInput = styled((props: React.ComponentProps<typeof TextField>) => <TextField fullWidth variant='standard' {...props} />)`
  background-color: ${({ theme }) => theme.palette.background.paper};
  flex: 1;
`;
export const LocationPickerButton = styled((props: React.ComponentProps<typeof Button>) => <Button variant='contained' color='inherit' {...props} />)`
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
export const SoftLinkToMainWikiSelect = styled((props: React.ComponentProps<typeof LocationPickerInput>) => <LocationPickerInput {...props} />)`
  width: 100%;
`;
export const SubWikiTagAutoComplete = styled((props: React.ComponentProps<typeof Autocomplete>) => <Autocomplete {...props} />)``;
export const WikiLocation = styled((props: { children?: ReactNode } & React.ComponentProps<typeof Typography>) => (
  <Typography variant='body2' noWrap display='inline' align='center' {...props} />
))`
  direction: rtl;
  text-transform: none;
  margin-left: 5px;
  margin-right: 5px;
`;

export function ReportErrorButton(props: { message: string }): React.JSX.Element {
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
export function ReportErrorFabButton(props: { message: string }): React.JSX.Element {
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
