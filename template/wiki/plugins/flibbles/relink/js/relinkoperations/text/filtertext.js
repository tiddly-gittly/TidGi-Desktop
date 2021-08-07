/*\

This relinks tiddlers which contain filters in their body, as oppose to
wikitext.

\*/

/*jslint node: false, browser: true */
/*global $tw: false */
"use strict";

var filterHandler = require("$:/plugins/flibbles/relink/js/utils").getType('filter');

exports.type = 'text/x-tiddler-filter';

exports.report = function(tiddler, callback, options) {
	return filterHandler.report(tiddler.fields.text, callback, options);
};

exports.relink = function(tiddler, fromTitle, toTitle, options) {
	return filterHandler.relink(tiddler.fields.text, fromTitle, toTitle, options)
};
