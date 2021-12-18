Feature: Open
  As a user of TidGi
  I want to open the app
  So I can be more productive

  Scenario: Opening TidGi
    Given the app is launched
    Then the element "#new-user-tip" is on the page
    Then the element "#add-workspace-button" is on the page

  Scenario: Opening Add Workspace Page
    Given the app is launched
    Then the element "#add-workspace-button" is on the page
    Then click on this element
    Then "添加工作区 tidgi-dev" window show up

  Scenario: Opening Preferences Page
    Given the app is launched
    Then the element "#open-preferences-button" is on the page
    Then click on this element
    Then "设置..." window show up

  Scenario: Opening Notifications Page
    Given the app is launched
    Then the element "#open-notification-settings-button" is on the page
    Then click on this element
    Then "消息管理..." window show up