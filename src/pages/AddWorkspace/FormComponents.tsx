import styled, { css } from 'styled-components';
import { Paper, Button, TextField, Autocomplete, Typography } from '@material-ui/core';

export const CreateContainer = styled(Paper)`
  padding: 10px;
  margin-top: 10px;
`;
export const LocationPickerContainer = styled.div`
  display: flex;
  flex-direction: row;
  margin-bottom: 10px;
`;
export const LocationPickerInput = styled(TextField)``;
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
