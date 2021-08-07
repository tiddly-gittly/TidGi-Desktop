/*\
module-type: startup

Replaces the relinkTiddler defined in $:/core/modules/wiki-bulkops.js

This is a startup instead of a wikimethods module-type because it's the only
way to ensure this runs after the old relinkTiddler method is applied.

\*/
(function(){

/*jslint node: false, browser: true */
/*global $tw: false */
"use strict";

var language = require('$:/plugins/flibbles/relink/js/language.js');
var utils = require("$:/plugins/flibbles/relink/js/utils.js");

exports.name = "redefine-relinkTiddler";
exports.synchronous = true;
// load-modules is when wikimethods are applied in
// ``$:/core/modules/startup/load-modules.js``
exports.after = ['load-modules'];

exports.startup = function() {
	$tw.Wiki.prototype.relinkTiddler = relinkTiddler;
};

/** Walks through all relinkable tiddlers and relinks them.
 *  This replaces the existing function in core Tiddlywiki.
 */
function relinkTiddler(fromTitle, toTitle, options) {
	options = options || {};
	var failures = [];
	var indexer = utils.getIndexer(this);
	var records = indexer.relinkLookup(fromTitle, toTitle, options);
	for (var title in records) {
		var entries = records[title],
			changes = Object.create(null),
			update = false,
			fails = false;
		for (var field in entries) {
			var entry = entries[field];
			fails = fails || entry.impossible;
			if (entry.output) {
				changes[field] = entry.output;
				update = true;
			}
		}
		if (fails) {
			failures.push(title);
		}
		// If any fields changed, update tiddler
		if (update) {
			console.log("Renaming '"+fromTitle+"' to '"+toTitle+"' in '" + title + "'");

			var tiddler = this.getTiddler(title);
			var newTiddler = new $tw.Tiddler(tiddler,changes,this.getModificationFields())
			newTiddler = $tw.hooks.invokeHook("th-relinking-tiddler",newTiddler,tiddler);
			this.addTiddler(newTiddler);
			// If the title changed, we need to perform a nested rename
			if (newTiddler.fields.title !== title) {
				this.deleteTiddler(title);
				this.relinkTiddler(title, newTiddler.fields.title,options);
			}
		}
	};
	if (failures.length > 0) {
		var options = $tw.utils.extend(
			{ variables: {to: toTitle, from: fromTitle},
			  wiki: this},
			options );
		language.reportFailures(failures, options);
	}
};

})();
