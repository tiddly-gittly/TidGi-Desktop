Feature: Per-component network proxies
  As a user behind a controlled network
  I want each application component to use its configured proxy
  So that no configured traffic is sent directly to the public network

  @network-proxy
  Scenario: Route Wiki backend, Wiki web page, and Git traffic through configured proxies
    When I launch the TidGi application
    And I wait for the page to load completely
    Then the browser view should be loaded and visible
    When I execute TiddlyWiki code in browser view: "return fetch('http://wiki-frontend.proxy-test.invalid/probe').then(response => response.text()).then(text => { if (!text.includes('wiki-frontend.proxy-test.invalid')) throw new Error('Wiki frontend proxy response did not come from the mock proxy'); })"
    And I execute TiddlyWiki code in browser view: "return window.service.wiki.probeNetworkProxyForTest(window.meta().workspace.id, 'http://wiki-backend.proxy-test.invalid/probe').then(text => { if (!text.includes('wiki-backend.proxy-test.invalid')) throw new Error('Wiki backend proxy response did not come from the mock proxy'); })"
    And I execute TiddlyWiki code in browser view: "return window.service.git.probeNetworkProxyForTest('http://git.proxy-test.invalid/repository.git').then(text => { if (!text.includes('1111111111111111111111111111111111111111')) throw new Error('Git proxy response did not come from the mock proxy'); })"
