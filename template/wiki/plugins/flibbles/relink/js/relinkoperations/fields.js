/*\

Handles all fields specified in the plugin configuration. Currently, this
only supports single-value fields.

\*/

/*jslint node: false, browser: true */
/*global $tw: false */
"use strict";

var settings = require('$:/plugins/flibbles/relink/js/settings.js');
var log = require('$:/plugins/flibbles/relink/js/language.js').logRelink;
var EntryNode = require('$:/plugins/flibbles/relink/js/utils/entry');

var FieldEntry = EntryNode.newType("field");

FieldEntry.prototype.report = function() {
	var self = this;
	var output = [];
	$tw.utils.each(this.children, function(child) {
		if (child.report) {
			$tw.utils.each(child.report(), function(report) {
				if (report) {
					output.push(self.field + ": " + report);
				} else {
					output.push(self.field);
				}
			});
		} else {
			output.push(self.field);
		}
	});
	return output;
};

exports['fields'] = function(tiddler, fromTitle, toTitle, changes, options) {
	var fields = options.settings.getFields();
	$tw.utils.each(fields, function(handler, field) {
		var input = tiddler.fields[field];
		var entry = handler.relink(input, fromTitle, toTitle, options);
		if (entry !== undefined) {
			var fieldEntry = new FieldEntry();
			fieldEntry.field = field;
			fieldEntry.output = entry.output;
			fieldEntry.add(entry);
			changes[field] = fieldEntry;
		}
	});
};
