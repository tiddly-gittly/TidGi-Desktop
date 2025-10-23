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

    # Step 5: Trigger OAuth login
    # Note: oauth2-mock-server automatically redirects without showing login UI
    # This tests the token exchange logic which is the most critical part
    When I click on a "login button" element with selector "[data-testid='custom-oauth-login-button']"
    And I wait for 3 seconds
    
    # Step 6: After OAuth completes, page reloads and defaults to GitHub tab
    # Need to click Custom Server tab again to see the filled token
    When I click on a "custom server tab" element with selector "[data-testid='custom-server-tab']"

    # Step 7: The token should be filled in the form after OAuth completes
    Then I should see a "token input with non-empty value" element with selector "[data-testid='custom-token-input'] input:not([value=''])"

    # Step 8: Verify logout button appears
    Then I should see a "logout button" element with selector "[data-testid='custom-oauth-logout-button']"

    # Step 9: Close preferences window
    When I close "preferences" window

    # Cleanup
    And I stop Mock OAuth Server

  # For Github login debugging. Need human to fill in the real password of an one-time test account.
  # @oauth @github @real @manual
  # Scenario: Login with Real GitHub OAuth
  #   # NOTE: This test requires GITHUB_CLIENT_SECRET environment variable to be set
  #   # GitHub OAuth Apps don't support PKCE and require client_secret
  #   # Step 1: Open preferences window
  #   When I click on a "settings button" element with selector "#open-preferences-button"
  #   And I wait for 1 seconds
  #   When I switch to "preferences" window
  #   And I wait for 1 seconds
    
  #   # Step 2: Navigate to Sync section
  #   When I click on a "sync section" element with selector "[data-testid='preference-section-sync']"
  #   And I wait for 1 seconds

  #   # Step 3: Click GitHub login button (this will open a new OAuth window)
  #   When I click on a "GitHub login button" element with selector "[data-testid='github-login-button']"
  #   And I wait for 1 seconds

  #   # Step 4: Switch to the OAuth popup window
  #   When I switch to the newest window
  #   And I wait for 1 seconds
    
  #   # Step 5: Fill in GitHub credentials in the OAuth popup
  #   # GitHub's login page uses 'login' and 'password' as field names
  #   When I type "tiddlygit@gmail.com" in "GitHub email input" element with selector "input[name='login']"
  #   And I wait for 0.5 seconds
  #   When I type "PASSWORD HERE" in "GitHub password input" element with selector "input[name='password']"
  #   And I wait for 0.5 seconds
  #   When I click on a "GitHub sign in button" element with selector "input[type='submit'][name='commit']"
  #   And I wait for 1 seconds

  #   # Step 6: Click Authorize button on the OAuth authorization page
  #   # GitHub App requires user to authorize access to their account
  #   # The button is usually green and says "Authorize [AppName]"
  #   # When I click on a "GitHub authorize button" element with selector "button[type='submit'].btn-primary, button[id*='authorize'], button.js-oauth-authorize-btn"
  #   # And I wait for 3 seconds
    
  #   # Step 7: Switch back to preferences window
  #   # The OAuth window should close automatically after authorization
  #   When I switch to "preferences" window
  #   And I wait for 1 seconds
    
  #   # Step 7: Verify token is filled in the form with actual value
  #   Then I should see a "GitHub token field with value" element with selector "[data-testid='github-token-input'] input:not([value=''])"
    
  #   # Step 8: Verify user info is populated with actual value
  #   Then I should see a "GitHub username field with value" element with selector "[data-testid='github-userName-input'] input:not([value=''])"
    
  #   # Step 9: Close preferences window
  #   When I close "preferences" window