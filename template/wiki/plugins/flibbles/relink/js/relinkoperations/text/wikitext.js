/*\

Checks for fromTitle in a tiddler's text. If found, sees if it's relevant,
and tries to swap it out if it is.

\*/

/*jslint node: false, browser: true */
/*global $tw: false */
"use strict";

var type = 'text/vnd.tiddlywiki';
var Placeholder = require("$:/plugins/flibbles/relink/js/utils/placeholder.js");
var settings = require('$:/plugins/flibbles/relink/js/settings.js');
var wikitextHandler = settings.getType('wikitext');

exports[type] = function(tiddler, fromTitle, toTitle, options) {
	var placeholder = new Placeholder();
	var currentOptions = $tw.utils.extend(
		{
			currentTiddler: tiddler.fields.title,
			placeholder: placeholder
		}, options);
	var entry = wikitextHandler.relink(tiddler.fields.text, fromTitle, toTitle, currentOptions);
	if (entry && entry.output) {
		// If there's output, we've also got to prepend any macros
		// that the placeholder defined.
		var preamble = placeholder.getPreamble();
		entry.output = preamble + entry.output;
	}
	return entry;
}
