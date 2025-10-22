Feature: OAuth Login Flow
  As a user
  I want to login via OAuth with PKCE using GitHub OAuth
  So that I can securely authenticate and sync my wiki

  Background:
    Given I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"

  @oauth @pkce
  Scenario: Login with Custom OAuth Server using PKCE
    # Step 1: Start Mock OAuth Server
    When I start Mock OAuth Server on port 8888
    
    # Step 2: Open preferences window
    When I click on a "settings button" element with selector "#open-preferences-button"
    When I switch to "preferences" window

    # Step 2: Navigate to Sync section
    When I click on a "sync section" element with selector "[data-testid='preference-section-sync']"

    # Step 3: Click Custom Server tab
    When I click on a "custom server tab" element with selector "[data-testid='custom-server-tab']"

    # Step 4: Verify Custom Server form is visible
    Then I should see "server url input and client id input" elements with selectors:
      | [data-testid='custom-server-url-input'] |
      | [data-testid='custom-client-id-input']  |

    # Step 5: Trigger OAuth login - this will navigate to the OAuth server's login page
    When I click on a "login button" element with selector "[data-testid='custom-oauth-login-button']"
    And I wait for 1 seconds

    # Step 6: Fill in the login form on the OAuth server (still in preferences window)
    When I type "testuser" in "username input" element with selector "[data-testid='oauth-username-input']"
    When I type "testpass" in "password input" element with selector "[data-testid='oauth-password-input']"
    When I click on a "OAuth sign in button" element with selector "[data-testid='oauth-sign-in-button']"
    And I wait for 2 seconds

    # Step 7: After OAuth completes, page reloads and defaults to GitHub tab
    # Need to click Custom Server tab again to see the filled token
    When I click on a "custom server tab" element with selector "[data-testid='custom-server-tab']"

    # Step 7: The token should be filled in the form after OAuth completes
    Then I should see a "token input with non-empty value" element with selector "[data-testid='custom-token-input'] input:not([value=''])"

    # Step 7: Verify logout button appears
    Then I should see a "logout button" element with selector "[data-testid='custom-oauth-logout-button']"

    # Step 8: Close preferences window
    When I close "preferences" window

    # Cleanup
    And I stop Mock OAuth Server
