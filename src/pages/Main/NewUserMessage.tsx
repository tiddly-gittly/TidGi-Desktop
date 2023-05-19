import { Trans, useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { IPreferences } from '@services/preferences/interface';
import { WindowNames } from '@services/windows/WindowProperties';

import arrowBlack from '@/images/arrow-black.png';
import arrowWhite from '@/images/arrow-white.png';

const Arrow = styled.div<{ image: string }>`
  height: 202px;
  width: 150px;
  position: absolute;
  top: 50px;
  left: 72px;

  background-image: url(${({ image }) => image});
  background-size: 150px 202px;
`;

const Avatar = styled.div`
  display: inline-block;
  height: 32px;
  width: 32px;
  background-color: ${({ theme }) => theme.palette.background.default};
  border-radius: 4;
  color: ${({ theme }) => theme.palette.text.primary};
  line-height: 32px;
  text-align: center;
  font-weight: 500;
  text-transform: uppercase;
  margin-left: 10px;
  margin-right: 10px;
  /** // TODO: dark theme  */
  /* border: theme.palette.type === 'dark' ? 'none' : 1px solid rgba(0, 0, 0, 0.12); */
`;

const Tip2Text = styled.span`
  display: inline-block;
  font-size: 18px;
  color: ${({ theme }) => theme.palette.text.primary};
`;

const TipWithSidebar = styled.div`
  position: absolute;
  top: 112px;
  left: 180px;
  user-select: none;
`;

const TipWithoutSidebar = styled.div`
  user-select: none;
`;

const AddWorkspaceGuideInfoContainer = styled.div`
  cursor: pointer;
`;

export interface IProps {
  sidebar: IPreferences['sidebar'];
  themeSource: IPreferences['themeSource'];
}

export function NewUserMessage(props: IProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <AddWorkspaceGuideInfoContainer
      onClick={async () => {
        await window.service.window.open(WindowNames.addWorkspace);
      }}
    >
      {props.sidebar
        ? (
          <>
            <Arrow image={props.themeSource === 'dark' ? arrowWhite : arrowBlack} />
            <TipWithSidebar id='new-user-tip'>
              <Trans t={t} i18nKey='AddWorkspace.MainPageTipWithSidebar'>
                <Tip2Text>Click</Tip2Text>
                <Avatar>+</Avatar>
                <Tip2Text>to get started!</Tip2Text>
              </Trans>
            </TipWithSidebar>
          </>
        )
        : (
          <TipWithoutSidebar id='new-user-tip'>
            <Tip2Text>
              <Trans t={t} i18nKey='AddWorkspace.MainPageTipWithoutSidebar'>
                <span>Click</span>
                <strong>Workspaces &gt; Add Workspace</strong>
                <span>Or</span>
                <strong>Click Here</strong>
                <span>to get started!</span>
              </Trans>
            </Tip2Text>
          </TipWithoutSidebar>
        )}
    </AddWorkspaceGuideInfoContainer>
  );
}
