Feature: TidGi Application Launch
  As a user
  I want to launch TidGi successfully
  So that I can use the application

  @smoke @logging
  Scenario: Application starts, shows interface, and logs work
    Given I start mock analytics server
    When I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    And the window title should contain "太记"
    # Verify renderer logging works by navigating to preferences
    When I click on a "settings button" element with selector "#open-preferences-button"
    When I switch to "preferences" window
    When I click on a "sync section" element with selector "[data-testid='preference-section-sync']"
    Then I should find log entries containing
      | test-id-Preferences section clicked |
    Then I should see analytics events:
      | event_name      | window        |
      | settings.opened | preferences   |
    # Switch back to main window for filesystem watch calibration
    When I switch to "main" window
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Enable filesystem watch — the heaviest operation in the suite
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    # Stress-test the watcher with repeated file operations
    # Running multiple create/modify/delete cycles captures watcher
    # performance degradation that occurs in the full test suite
    When I create file "{tmpDir}/wiki/tiddlers/CalibrationProbe.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: CalibrationProbe

      Initial probe content
      """
    Then I wait for tiddler "CalibrationProbe" to be added by watch-fs
    When I modify file "{tmpDir}/wiki/tiddlers/CalibrationProbe.tid" to contain "Modified probe content v1"
    Then I wait for tiddler "CalibrationProbe" to be updated by watch-fs
    When I modify file "{tmpDir}/wiki/tiddlers/CalibrationProbe.tid" to contain "Modified probe content v2"
    Then I wait for tiddler "CalibrationProbe" to be updated by watch-fs
    When I delete file "{tmpDir}/wiki/tiddlers/CalibrationProbe.tid"
    Then I wait for tiddler "CalibrationProbe" to be deleted by watch-fs
    # Second file cycle — measures performance under sustained watcher load
    When I create file "{tmpDir}/wiki/tiddlers/CalibrationProbe2.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: CalibrationProbe2

      Second probe content
      """
    Then I wait for tiddler "CalibrationProbe2" to be added by watch-fs
    When I modify file "{tmpDir}/wiki/tiddlers/CalibrationProbe2.tid" to contain "Modified probe2 content"
    Then I wait for tiddler "CalibrationProbe2" to be updated by watch-fs
    When I delete file "{tmpDir}/wiki/tiddlers/CalibrationProbe2.tid"
    Then I wait for tiddler "CalibrationProbe2" to be deleted by watch-fs
