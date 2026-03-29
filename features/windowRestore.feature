Feature: TidGi Main Window Reopen
  As a user with tidgi mini window enabled
  I want the wiki WebContentsView to be immediately visible after reopening the main window
  So that I do not have to switch workspace to trigger a repaint

  Background:
    Given I cleanup test wiki so it could create a new one on start
    And I configure tidgi mini window and disable runOnBackground
    When I launch the TidGi application
    And I wait for the page to load completely
    # Wait for the wiki worker to fully start before any scenario steps run.
    # "the browser view should be loaded and visible" is unreliable in the test environment
    # because TiddlyWiki startup can exceed the 21-second step timeout.
    # Using log markers gives a deterministic signal that the wiki is ready.
    Then I wait for "wiki worker started" log marker "[test-id-WIKI_WORKER_STARTED]"
    Then I wait for "view loaded" log marker "[test-id-VIEW_LOADED]"
    And I confirm the "main" window browser view is positioned within visible window bounds

  @wiki @window-restore
  Scenario: Wiki WebContentsView is visible immediately after reopening the main window
    # Clear the refresh log markers so we can verify they fire after the reopen
    And I clear log lines containing "[test-id-REFRESH_ACTIVE_VIEW_START]"
    And I clear log lines containing "[test-id-REFRESH_ACTIVE_VIEW_DONE]"
    And I clear log lines containing "[test-id-VIEW_SHOWN]"
    # Close the main window. With tidgi mini window still open, the app stays alive,
    # and reopening the app icon recreates the main BrowserWindow.
    When I close "main" window
    And I confirm the "main" window not visible
    # Reopen as a second-instance launch would (app.emit('second-instance'))
    When I reopen the main window as second instance would
    # Verify the main window is visible again
    Then I confirm the "main" window visible
    And I switch to "main" window
    # refreshActiveWorkspaceView must have been called: this is the key fix being tested
    Then I wait for "refresh active view completed" log marker "[test-id-REFRESH_ACTIVE_VIEW_DONE]"
    # showView must have been called for the wiki workspace in main window
    Then I wait for "view shown" log marker "[test-id-VIEW_SHOWN]"
    # The browser view must be positioned within visible window bounds (not offscreen)
    And I confirm the "main" window browser view is positioned within visible window bounds
    # And it must continue to track the window size after restore. This catches the regression
    # where the restored view was re-attached to a new BrowserWindow but kept its resize listener
    # on the old destroyed window instance.
    When I resize the "main" window to 1180x760
    And I confirm the "main" window browser view fills the window content area

