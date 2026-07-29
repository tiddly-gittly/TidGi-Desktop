Feature: Workspace Log Viewer
  As a user
  I want to open the logs related to a workspace from its context menu
  So that I can diagnose backup, server, and frontend problems separately

  Background:
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for "wiki worker logging ready" log marker "test-id-WorkerServicesReady"
    And I wait for "wiki renderer logging ready" log marker "[test-id-WIKI_RENDERER_LOGGING_READY]"

  @log-viewer
  Scenario: Open backup, server, and frontend logs from the current workspace menu
    When I right-click on a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    And I click menu "当前工作区 > 打开日志 > 历史备份日志"
    And I switch to "gitHistory" window
    And I wait for the page to load completely
    Then I should see a "git log list" element with selector "[data-testid='git-log-list']"

    When I switch to "main" window
    And I right-click on a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    And I click menu "当前工作区 > 打开日志 > 服务端日志"
    And I switch to "logViewer" window
    And I wait for the page to load completely
    And I type "test-id-WorkerServicesReady" in "log search" element with selector "[data-testid='log-search-input']"
    Then I should see "selected server log source and worker marker" elements with selectors:
      | element description       | selector                                                              |
      | selected server source    | [data-testid^='log-source-'][data-testid$=':wiki-worker'][data-selected='true'] |
      | worker logging ready      | [data-testid^='log-entry-']:has-text('test-id-WorkerServicesReady')    |

    When I close "logViewer" window
    And I switch to "main" window
    And I right-click on a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    And I click menu "当前工作区 > 打开日志 > 前端网页日志"
    And I switch to "logViewer" window
    And I wait for the page to load completely
    And I type "[test-id-WIKI_RENDERER_LOGGING_READY]" in "log search" element with selector "[data-testid='log-search-input']"
    Then I should see "selected frontend log source and renderer marker" elements with selectors:
      | element description       | selector                                                                  |
      | selected frontend source  | [data-testid^='log-source-'][data-testid$=':wiki-renderer'][data-selected='true'] |
      | renderer logging ready    | [data-testid^='log-entry-']:has-text('[test-id-WIKI_RENDERER_LOGGING_READY]') |
