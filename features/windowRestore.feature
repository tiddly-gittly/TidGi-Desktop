Feature: TidGi Window Hide and Restore
  As a user with runOnBackground enabled
  I want the wiki WebContentsView to be immediately visible after restoring the window
  So that I do not have to switch workspace to trigger a repaint

  Background:
    Given I cleanup test wiki so it could create a new one on start
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
  Scenario: Wiki WebContentsView is visible immediately after restoring hidden window
    # Clear the refresh log markers so we can verify they fire after the reopen
    And I clear log lines containing "[test-id-REFRESH_ACTIVE_VIEW_START]"
    And I clear log lines containing "[test-id-REFRESH_ACTIVE_VIEW_DONE]"
    And I clear log lines containing "[test-id-VIEW_SHOWN]"
    # Hide the window (same code path as closing with runOnBackground=true)
    When I hide the main window as if closing with runOnBackground
    # Verify the main window is no longer visible
    And I confirm the "main" window not visible
    # Reopen as a second-instance launch would (app.emit('second-instance'))
    When I reopen the main window as second instance would
    # Verify the main window is visible again
    Then I confirm the "main" window visible
    # refreshActiveWorkspaceView must have been called: this is the key fix being tested
    Then I wait for "refresh active view completed" log marker "[test-id-REFRESH_ACTIVE_VIEW_DONE]"
    # showView must have been called for the wiki workspace in main window
    Then I wait for "view shown" log marker "[test-id-VIEW_SHOWN]"
    # The browser view must be positioned within visible window bounds (not offscreen)
    And I confirm the "main" window browser view is positioned within visible window bounds

  @wiki @window-restore @workspace-icon-click
  Scenario: Clicking already-active workspace icon re-shows the WebContentsView
    # Hide and reopen to put the window in a potentially-blank state
    When I hide the main window as if closing with runOnBackground
    And I confirm the "main" window not visible
    When I reopen the main window as second instance would
    Then I confirm the "main" window visible
    # Ensure initial restore is complete before testing the workspace icon click path
    Then I wait for "refresh active view completed" log marker "[test-id-REFRESH_ACTIVE_VIEW_DONE]"
    # Clear the markers so the next workspace click fires fresh ones
    And I clear log lines containing "[test-id-VIEW_SHOWN]"
    # Click the already-active workspace icon — this previously was a no-op due to the
    # oldId !== newId guard in openWorkspaceTiddler which prevented setActiveWorkspaceView from running
    When I click on a "wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # showView must be called again via setActiveWorkspaceView → showWorkspaceView path
    Then I wait for "view shown after workspace click" log marker "[test-id-VIEW_SHOWN]"
    # Content must still be visible
    And I confirm the "main" window browser view is positioned within visible window bounds
