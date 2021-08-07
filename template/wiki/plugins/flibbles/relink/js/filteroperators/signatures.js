/*\
module-type: relinkfilteroperator

This filter returns all input tiddlers which are a source of
relink configuration.

`[all[tiddlers+system]relink:source[macros]]`

\*/

var utils = require('$:/plugins/flibbles/relink/js/utils.js');

exports.signatures = function(source,operator,options) {
	var plugin = operator.operand || null;
	var set = getSet(options);
	if (plugin === "$:/core") {
		// Core doesn't actually have any settings. We mean Relink
		plugin = "$:/plugins/flibbles/relink";
	}
	var signatures = [];
	for (var signature in set) {
		var source = set[signature].source;
		if (options.wiki.getShadowSource(source) === plugin) {
			signatures.push(signature);
		}
	}
	return signatures;
};

exports.type = function(source,operator,options) {
	var results = [];
	var set = getSet(options);
	source(function(tiddler, signature) {
		if (set[signature]) {
			results.push(set[signature].name);
		}
	});
	return results;
};

exports.types = function(source,operator,options) {
	var def = utils.getDefaultType(options.wiki);
	var types = Object.keys(utils.getTypes());
	types.sort();
	// move default to front
	types.sort(function(x,y) { return x === def ? -1 : y === def ? 1 : 0; });
	return types;
};

exports.source = function(source,operator,options) {
	var results = [];
	var category = operator.suffix;
	var set = getSet(options);
	source(function(tiddler, signature) {
		if (set[signature]) {
			results.push(set[signature].source);
		}
	});
	return results;
};

function getSet(options) {
	return options.wiki.getGlobalCache("relink-signatures", function() {
		var config = utils.getWikiContext(options.wiki);
		var set = Object.create(null);
		var categories = {
			attributes: config.getAttributes(),
			fields: config.getFields(),
			macros: config.getMacros(),
			operators: config.getOperators()};
		$tw.utils.each(categories, function(list, category) {
			$tw.utils.each(list, function(item, key) {
				set[category + "/" + key] = item;
			});
		});
		return set;
	});
};
