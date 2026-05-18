Feature: Git Operations Calibration
  As a developer
  I want to measure git operation timing
  So that timeouts cover the slowest real-world scenarios

  @calibration-git
  Scenario: Uncommitted change detection after watch-fs update
    # Measures: wiki launch, git init, file modification, watch-fs detection,
    # git menu navigation, and uncommitted changes rendering.
    When I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    And I wait for "git initialization" log marker "[test-id-git-init-complete]"
    And I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to contain "Modified Index content — git calibration measurement"
    Then I wait for tiddler "Index" to be updated by watch-fs
    When I click menu "同步和备份 > 查看历史备份"
    And I should see "Modified Index content" in the browser view content
    And I switch to "gitHistory" window
    And I wait for the page to load completely
    Then I should see a "uncommitted changes row" element with selector "[data-testid='uncommitted-changes-row']"
