Feature: TidGi Default Wiki
  As a user
  I want app auto create a default wiki workspace for me
  So that I can start using wiki immediately

  @wiki
  Scenario: Application has default wiki workspace
    # Note: tests expect the test wiki parent folder to exist. Run the preparation step before E2E:
    #   cross-env NODE_ENV=test pnpm dlx tsx scripts/developmentMkdir.ts
    When I launch the TidGi application
    And I cleanup test wiki
    And I wait for 5 seconds
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    And the window title should contain "太记"
    And I should see a "wiki workspace" element with selector "*:has-text('wiki')"
