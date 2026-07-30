Feature: Per-component network proxies
  As a user behind a controlled network
  I want each application component to use its configured proxy
  So that no configured traffic is sent directly to the public network

  @network-proxy
  Scenario: Route Wiki backend, Wiki web page, and Git traffic through configured proxies
    Given I start a mock proxy server and configure network proxies
    When I launch the TidGi application
    And I wait for the page to load completely
    Then the browser view should be loaded and visible
    When I request through the Wiki web page proxy
    And I request through the Wiki backend proxy
    And I request through the Git process proxy
    Then the mock proxy server should receive all target traffic
