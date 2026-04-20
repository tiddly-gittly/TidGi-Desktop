Feature: Webview dark background on startup
  As a user
  I want webview to follow system dark palette immediately
  So that startup does not flash or stay in light mode

  @webview-theme-color
  Scenario Outline: Startup webview background follows mocked system palette <palette>
    Given I cleanup test wiki so it could create a new one on start
    And I mock system palette as "<palette>"
    When I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then I wait for "view loaded" log marker "[test-id-VIEW_LOADED]"
    And the browser view should be loaded and visible
    Then browser view body background should be "<palette>"

    Examples:
      | palette |
      | dark    |
      | light   |
