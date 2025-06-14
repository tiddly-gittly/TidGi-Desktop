import { Box, FormControl, FormLabel } from '@mui/material';
import { styled } from '@mui/material/styles';

export const StyledFieldFormControl = styled(FormControl)`
  margin-bottom: ${({ theme }) => theme.spacing(2)};
  width: 100%;
`;

export const StyledFormLabel = styled(FormLabel)`
  font-size: ${({ theme }) => theme.typography.subtitle2.fontSize};
  font-weight: ${({ theme }) => theme.typography.subtitle2.fontWeight};
  color: ${({ theme }) => theme.palette.text.primary};
  margin-bottom: ${({ theme }) => theme.spacing(1)};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing(0.5)};
`;

export const StyledControlGroup = styled((props: React.ComponentProps<typeof Box>) => <Box {...props} />)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing(1)};
  flex-wrap: wrap;
`;

export const StyledFieldWrapper = styled((props: React.ComponentProps<typeof Box>) => <Box {...props} />)`
  position: relative;
  margin-bottom: ${({ theme }) => theme.spacing(1)};
`;

export const StyledErrorText = styled((props: React.ComponentProps<typeof Box>) => <Box {...props} />)`
  color: ${({ theme }) => theme.palette.error.main};
  font-size: ${({ theme }) => theme.typography.caption.fontSize};
  margin-top: ${({ theme }) => theme.spacing(0.5)};
  margin-left: ${({ theme }) => theme.spacing(1)};
`;
