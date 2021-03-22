import React from 'react';
import styled from 'styled-components';
import { Button, DialogContent } from '@material-ui/core';
import { usePromiseValue } from '@/helpers/useServiceValue';

const Icon = styled.img`
  height: 96;
  width: 96;
`;

const DialogContentSC = styled(DialogContent)`
  min-width: 320;
  text-align: 'center';
`;

const Title = styled.h6`
  margin-top: 10px;
`;

const Version = styled.p`
  margin-bottom: 20px;
`;

const VersionSmallContainer = styled.div`
  margin-top: 20px;
  margin-bottom: 20px;
`;

const VersionSmall = styled.span`
  font-size: 0.8rem;
`;

const GoToTheWebsiteButton = styled(Button)`
  margin-right: 10px;
`;

const MadeBy = styled.div`
  margin-top: 20px;
`;

const Link = styled.span`
  font-weight: 600;
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
`;

export default function About(): JSX.Element {
  const versions = usePromiseValue(async () => {
    const processVersions = (await window.service.context.get('environmentVersions')) as NodeJS.ProcessVersions;
    return [
      { name: 'Electron Version', version: processVersions.electron },
      { name: 'Node Version', version: processVersions.node },
      { name: 'Chromium Version', version: processVersions.chrome },
    ];
  }, [] as Array<{ name: string; version: string }>);

  const iconPath = usePromiseValue<string>(async () => (await window.service.context.get('ICON_PATH')) as string);
  const appVersion = usePromiseValue<string>(async () => (await window.service.context.get('appVersion')) as string);
  const platform = usePromiseValue<string>(async () => (await window.service.context.get('platform')) as string);

  return (
    <div>
      <DialogContentSC>
        <Icon src={iconPath} alt="TiddlyGit" />
        <Title>TiddlyGit ({platform ?? 'Unknown Platform'})</Title>
        <Version>{`Version v${appVersion ?? ' - '}.`}</Version>
        <VersionSmallContainer>
          {versions?.map(({ name, version }) => (
            <VersionSmall key={name}>
              {name}: {version}
            </VersionSmall>
          ))}
        </VersionSmallContainer>

        <GoToTheWebsiteButton onClick={async () => await window.service.native.open('https://github.com/tiddly-gittly/TiddlyGit-Desktop')}>
          Website
        </GoToTheWebsiteButton>
        <br />
        <GoToTheWebsiteButton onClick={async () => await window.service.native.open('https://github.com/tiddly-gittly/TiddlyGit-Desktop/issues/new/choose')}>
          Support
        </GoToTheWebsiteButton>

        <MadeBy>
          <span>Made with </span>
          <span role="img" aria-label="love">
            ❤
          </span>
          <span> by </span>
          <Link
            onClick={async () => await window.service.native.open('https://onetwo.ren/wiki/')}
            onKeyDown={async (event) => {
              if (event.key !== 'Enter') {
                return;
              }
              await window.service.native.open('https://onetwo.ren/wiki/');
            }}
            role="link"
            tabIndex={0}>
            Lin Onetwo
          </Link>
          <span> and </span>
          <Link
            onClick={async () => await window.service.native.open('https://webcatalog.app/?utm_source=tiddlygit_app')}
            onKeyDown={async (event) => {
              if (event.key !== 'Enter') {
                return;
              }
              await window.service.native.open('https://webcatalog.app/?utm_source=tiddlygit_app');
            }}
            role="link"
            tabIndex={0}>
            WebCatalog
          </Link>
        </MadeBy>
      </DialogContentSC>
    </div>
  );
}
