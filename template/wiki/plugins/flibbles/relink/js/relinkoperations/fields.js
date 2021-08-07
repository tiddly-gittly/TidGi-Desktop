/*\

Handles all fields specified in the plugin configuration. Currently, this
only supports single-value fields.

\*/

/*jslint node: false, browser: true */
/*global $tw: false */
"use strict";

exports.name = 'fields';

exports.report = function(tiddler, callback, options) {
	var fields = options.settings.getFields();
	$tw.utils.each(fields, function(handler, field) {
		var input = tiddler.fields[field];
		if (input) {
			handler.report(input, function(title, blurb) {
				if (blurb) {
					callback(title, field + ': ' + blurb);
				} else {
					callback(title, field);
				}
			}, options);
		}
	});
};

exports.relink = function(tiddler, fromTitle, toTitle, changes, options) {
	var fields = options.settings.getFields();
	$tw.utils.each(fields, function(handler, field) {
		var input = tiddler.fields[field];
		if (input) {
			var entry = handler.relink(input, fromTitle, toTitle, options);
			if (entry !== undefined) {
				changes[field] = entry;
			}
		}
	});
};
