import { Route, Switch } from 'wouter';
import React from 'react';
import { styled } from 'styled-components';
import { AgentTabs } from './AgentTabs';
import { AgentsManage } from './AgentsManage';
import { SearchTab } from './components/SearchTab';
import { NewAgentTab } from './components/NewAgentTab';
import { ChatDetail } from './ChatDetail';
import { NewTabPage } from './components/NewTabPage';

// 主容器，横向布局
const Container = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
`;

// 左侧边栏，包含搜索、标签页和新标签按钮
const Sidebar = styled.div`
  display: flex;
  flex-direction: column;
  width: 300px;
  height: 100%;
  border-right: 1px solid ${props => props.theme.palette.divider};
  background-color: ${props => props.theme.palette.background.paper};
`;

// 右侧内容区域
const Content = styled.div`
  flex: 1;
  height: 100%;
  overflow: hidden;
`;

export default function Agent(): React.JSX.Element {
  return (
    <Container>
      <Sidebar>
        <SearchTab />
        <AgentTabs />
        <NewAgentTab />
      </Sidebar>
      
      <Content>
        <Switch>
          <Route path="/session/:taskId" component={ChatDetail} />
          <Route path="/new-tab" component={NewTabPage} />
          <Route path="/agents" component={AgentsManage} />
          <Route path="/" component={NewTabPage} />
        </Switch>
      </Content>
    </Container>
  );
}
