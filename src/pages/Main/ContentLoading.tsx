import { CircularProgress } from '@mui/material';
import { styled } from '@mui/material/styles';

const LoadingRoot = styled('div')`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background-color: ${({ theme }) => theme.palette.background.default};
`;

export function ContentLoading(): React.JSX.Element {
  return (
    <LoadingRoot>
      <CircularProgress />
    </LoadingRoot>
  );
}
