Feature: Open
  As a user of TiddlyGit
  I want to open the app
  So I can be more productive

  Scenario: Opening TiddlyGit
    Given the app is launched
    Then the element "#new-user-tip" is on the page
    Then the element "#add-workspace-button" is on the page

  Scenario: Opening TiddlyGit
    Given the app is launched
    Then the element "#add-workspace-button" is on the page
    Then click on this element
    Then "Add Workspace" window show up