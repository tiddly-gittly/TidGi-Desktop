Feature: TidGi Application Launch
  As a user
  I want to launch TidGi successfully
  So that I can use the application

  @smoke @logging
  Scenario: Basic launch, preferences, and filesystem watch setup
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
    # Switch to main window for filesystem watch calibration
    When I switch to "main" window
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Enable filesystem watch and create probe files
    # These files accumulate state that makes the watcher slower on restart
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    # Exercise background operations for realistic timing measurements.
    # Git init and SSE long-polling take seconds, not milliseconds.
    And I wait for "git initialization" log marker "[test-id-git-init-complete]"
    When I create file "{tmpDir}/wiki/tiddlers/ProbeAlpha.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: ProbeAlpha
      tags: calibration
      Alpha probe
      """
    Then I wait for tiddler "ProbeAlpha" to be added by watch-fs
    When I create file "{tmpDir}/wiki/tiddlers/ProbeBeta.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: ProbeBeta
      tags: calibration
      Beta probe
      """
    Then I wait for tiddler "ProbeBeta" to be added by watch-fs
    When I create file "{tmpDir}/wiki/tiddlers/ProbeGamma.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: ProbeGamma
      tags: calibration
      Gamma probe
      """
    Then I wait for tiddler "ProbeGamma" to be added by watch-fs

  @smoke
  Scenario: Watcher re-index under accumulated file state
    # This scenario runs AFTER the first one, on a system where the
    # wiki has been restarted and the watcher must re-index files
    # created by the previous scenario. The "wait for SSE and watch-fs"
    # step measures worst-case watcher re-indexing under load.
    When I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    And I restart workspace "wiki"
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready

  @smoke
  Scenario: Third launch sample for variance capture
    # Extra launch to increase sample size for app launch timing.
    # Two scenarios give 4 launches (2 runs × 2). Adding a third
    # gives 6 samples to better capture the launch time distribution.
    When I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
