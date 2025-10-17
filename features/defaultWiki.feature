Feature: TidGi Default Wiki
  As a user
  I want app auto create a default wiki workspace for me
  So that I can start using wiki immediately

  Background:
    # Note: tests expect the test wiki parent folder to exist. Run the preparation step before E2E:
    #   cross-env NODE_ENV=test pnpm dlx tsx scripts/developmentMkdir.ts
    Given I cleanup test wiki
    When I launch the TidGi application
    And I wait for the page to load completely

  @wiki
  Scenario: Application has default wiki workspace
    Then I should see "page body and wiki workspace" elements with selectors:
      | body                                            |
      | div[data-testid^='workspace-']:has-text('wiki') |
    And the window title should contain "太记"

  @wiki @browser-view
  Scenario: Default wiki workspace displays TiddlyWiki content in browser view
    And the browser view should be loaded and visible
    And I should see "我的 TiddlyWiki" in the browser view content
