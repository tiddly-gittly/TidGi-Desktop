/*\
module-type: relinkoperator
title: $:/plugins/flibbles/relink-titles/relinkoperations/title.js
type: application/javascript

Renames tiddlers which have titles derived from fromTitle. Then it makes
sure that those tiddlers are properly relinked too.

\*/

/*jslint node: false, browser: true */
/*global $tw: false */
"use strict";

var configPrefix = "$:/config/flibbles/relink-titles/relink/";
var utils = require('$:/plugins/flibbles/relink/js/utils.js');
utils.getContext('whitelist').hotDirectories.push(configPrefix);

var titleRules = Object.create(null);
$tw.modules.forEachModuleOfType('relinktitlesrule', function(title, module) {
	titleRules[title] = module;
});

exports.name = 'title';

exports.report = function(tiddler, callback, options) {
	var cache = getCache(options),
		rules = cache.rules;
	for (var i = 0; i < rules.length; i++) {
		rules[i].report(tiddler.fields.title, function(title, blurb) {
			callback(title, blurb ? ('title: ' + blurb) : 'title');
		}, options);
	}
};

exports.relink = function(tiddler, fromTitle, toTitle, changes, options) {
	var cache = getCache(options),
		title = tiddler.fields.title;
	if (!cache.touched[title]) {
		var rules = cache.rules;
		for (var i = 0; i < rules.length; i++) {
			var rule = rules[i];
			var entry = rule.relink(title, fromTitle, toTitle, options);
			if (entry) {
				var result = entry.output;
				if (result && (result !== title)) {
					if (options.wiki.getTiddler(result) || cache.touched[result]) {
						// There's already a tiddler there. We won't clobber it.
						entry.impossible = true;
						entry.output = undefined;
					}
					cache.touched[result] = true;
				}
				// Record that we've touched this one, so we only touch it once.
				// Both its prior and latter. Neither should be touched again.
				cache.touched[title] = true;
				changes.title = entry;
				break;
			}
		}
	}
};

function getCache(options) {
	return utils.getCacheForRun(options, 'titles', function() {
		return {
			rules: getRules(options.wiki),
			touched: Object.create(null)
		};
	});
};

function getRules(wiki) {
	var activeRules = [];
	for (var rule in titleRules) {
		var configTiddler = wiki.getTiddler(configPrefix + rule);
		if (!configTiddler || configTiddler.fields.text !== "disabled") {
			activeRules.push(titleRules[rule]);
		}
	}
	return activeRules;
};
