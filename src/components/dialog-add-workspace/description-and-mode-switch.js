// @flow
import React from 'react';
import styled from 'styled-components';

import Paper from '@material-ui/core/Paper';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';

const Container = styled(Paper)`
  padding: 10px;
`;

interface Props {
  isCreateMainWorkspace: boolean;
  isCreateMainWorkspaceSetter: boolean => void;
}

export default function Description({ isCreateMainWorkspace, isCreateMainWorkspaceSetter }: Props) {
  return (
    <Container elevation={0} square>
      <FormControlLabel
        control={
          <Switch
            checked={isCreateMainWorkspace}
            onChange={event => isCreateMainWorkspaceSetter(event.target.checked)}
          />
        }
        label={`${isCreateMainWorkspace ? '主' : '子'}知识库`}
      />
      <Typography variant="body2" display="inline">
        {isCreateMainWorkspace
          ? '包含了TiddlyWiki的配置文件，以及发布为博客时的公开内容。'
          : '必须依附于一个主知识库，可用于存放私有内容，同步到一个私有的Github仓库内，仅本人可读写。子知识库通过创建一个到主知识库的软链接（快捷方式）来生效，创建链接后主知识库内便可看到子知识库内的内容了。'}
      </Typography>
    </Container>
  );
}
