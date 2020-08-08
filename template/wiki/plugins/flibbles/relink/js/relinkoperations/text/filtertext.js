/*\

This relinks tiddlers which contain filters in their body, as oppose to
wikitext.

\*/

/*jslint node: false, browser: true */
/*global $tw: false */
"use strict";

var filterHandler = require("$:/plugins/flibbles/relink/js/settings").getType('filter');

exports['text/x-tiddler-filter'] = function(tiddler, fromTitle, toTitle, options) {
	return filterHandler.relink(tiddler.fields.text, fromTitle, toTitle, options)
};
