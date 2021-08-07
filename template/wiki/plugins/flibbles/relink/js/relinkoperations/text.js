/*\

Depending on the tiddler type, this will apply textOperators which may
relink titles within the body.

\*/

/*jslint node: false, browser: true */
/*global $tw: false */
"use strict";

var defaultOperator = "text/vnd.tiddlywiki";
var utils = require('$:/plugins/flibbles/relink/js/utils.js');

exports.name = 'text';

var textOperators = utils.getModulesByTypeAsHashmap('relinktextoperator', 'type');

// $:/DefaultTiddlers is a tiddler which has type "text/vnd.tiddlywiki",
// but it lies. It doesn't contain wikitext. It contains a filter, so
// we pretend it has a filter type.
// If you want to be able to add more exceptions for your plugin, let me know.
var exceptions = {
	"$:/DefaultTiddlers": "text/x-tiddler-filter"
};

exports.report = function(tiddler, callback, options) {
	var fields = tiddler.fields;
	if (fields.text) {
		var type = exceptions[fields.title] || fields.type || defaultOperator;
		if (textOperators[type]) {
			var entry = textOperators[type].report(tiddler, callback, options);
		}
	}
};

exports.relink = function(tiddler, fromTitle, toTitle, changes, options) {
	var fields = tiddler.fields;
	if (fields.text) {
		var type = exceptions[fields.title] || fields.type || defaultOperator;
		if (textOperators[type]) {
			var entry = textOperators[type].relink(tiddler, fromTitle, toTitle, options);
			if (entry) {
				changes.text = entry;
			}
		}
	}
};
