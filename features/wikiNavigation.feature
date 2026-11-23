Feature: Wiki navigation retains its preload bridge
  @wikiNavigation
  Scenario: Reloading saves pending edits and creates a new document with working services
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
      | enableHTTPAPI         | true  |
      | port                  | 15212 |
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    When I execute TiddlyWiki code in browser view: 'document.body.dataset.beforeReload = "true"; $tw.wiki.addTiddler(new $tw.Tiddler({title: "NavigationReloadProbe", text: "Edit before reload"})); if (!$tw.syncer.isDirty()) throw new Error("Expected a pending wiki edit")'
    And I click menu "知识库列表 > 刷新当前工作区"
    Then the browser view should be loaded and visible
    And I should not see a "previous wiki document" element in browser view with selector "body[data-before-reload]"
    And tiddler "NavigationReloadProbe" in workspace "wiki" should be saved to disk with text "Edit before reload"
    When I open tiddler "NavigationReloadProbe" in browser view
    Then I should see a "saved tiddler" element in browser view with selector "[data-tiddler-title='NavigationReloadProbe']"
    And I execute TiddlyWiki code in browser view: 'if (typeof window.service?.workspace?.get !== "function") throw new Error("Expected workspace service in the new document")'
