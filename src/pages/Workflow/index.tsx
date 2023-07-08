/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/promise-function-async */
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

const InnerContentRoot = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px;
  width: 100%;
  height: 100%;
`;

export default function Workflow(): JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <InnerContentRoot>
        Workflow
      </InnerContentRoot>
    </>
  );
}
