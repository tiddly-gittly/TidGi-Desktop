Feature: Open
  As a user of TiddlyGit
  I want to open the app
  So I can be more productive

  Scenario: Opening TiddlyGit
    Given the app is launched
    Then the element "#new-user-tip" is on the page