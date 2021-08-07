/*\
module-type: library

Utility methods for relink.

\*/

var macroFilter =  "[[$:/core/ui/PageMacros]] [all[shadows+tiddlers]tag[$:/tags/Macro]!has[draft.of]]";

/**This works nearly identically to $tw.modules.getModulesByTypeAsHashmap
 * except that this also takes care of migrating V1 relink modules.
 */
exports.getModulesByTypeAsHashmap = function(moduleType, nameField) {
	var results = Object.create(null);
	$tw.modules.forEachModuleOfType(moduleType, function(title, module) {
		var key = module[nameField];
		if (key !== undefined) {
			results[key] = module;
		} else {
			for (var entry in module) {
				results[entry] = {
					relink: module[entry],
					report: function() {}};
			}
		}
	});
	return results;
};

exports.getTiddlerRelinkReferences = function(wiki, title, context) {
	var tiddler = wiki.getTiddler(title),
		references = Object.create(null),
		options = {settings: context, wiki: wiki};
	if (tiddler) {
		try {
			for (var relinker in getRelinkOperators()) {
				getRelinkOperators()[relinker].report(tiddler, function(title, blurb) {
					references[title] = references[title] || [];
					references[title].push(blurb);
				}, options);
			}
		} catch (e) {
			if (e.message) {
				e.message = e.message + "\nWhen reporting '" + title + "' Relink references";
			}
			throw e;
		}
	}
	return references;
};

/** Returns a pair like this,
 *  { title: {field: entry, ... }, ... }
 */
exports.getRelinkResults = function(wiki, fromTitle, toTitle, context, tiddlerList, options) {
	options = options || {};
	options.wiki = options.wiki || wiki;
	fromTitle = (fromTitle || "").trim();
	toTitle = (toTitle || "").trim();
	var changeList = Object.create(null);
	if(fromTitle && toTitle) {
		if (tiddlerList === undefined) {
			tiddlerList = wiki.getRelinkableTitles();
		}
		for (var i = 0; i < tiddlerList.length; i++) {
			var title = tiddlerList[i];
			var tiddler = wiki.getTiddler(title);
			if(tiddler && !tiddler.fields["plugin-type"]) {
				try {
					var entries = Object.create(null),
						operators = getRelinkOperators();
					options.settings = new Contexts.tiddler(wiki, context, title);
					for (var operation in operators) {
						operators[operation].relink(tiddler, fromTitle, toTitle, entries, options);
					}
					for (var field in entries) {
						// So long as there is one key,
						// add it to the change list.
						changeList[title] = entries;
						break;
					}
				} catch (e) {
					// Should we test for instanceof Error instead?: yes
					// Does that work in the testing environment?: no
					if (e.message) {
						e.message = e.message + "\nWhen relinking '" + title + "'";
					}
					throw e;
				}
			}
		}
	}
	return changeList;
};

var Contexts = $tw.modules.applyMethods('relinkcontext');

exports.getContext = function(name) {
	return Contexts[name];
};

exports.getWikiContext = function(wiki) {
	// This gives a fresh context every time. It is up to the indexer or
	// the cache to preserve those contexts for as long as needed.
	var whitelist = new Contexts.whitelist(wiki);
	return new Contexts.import(wiki, whitelist, macroFilter);
};

/** Returns the Relink indexer, or a dummy object which pretends to be one.
 */
exports.getIndexer = function(wiki) {
	if (!wiki._relink_indexer) {
		wiki._relink_indexer = (wiki.getIndexer && wiki.getIndexer("RelinkIndexer")) || new (require('$:/plugins/flibbles/relink/js/utils/backupIndexer.js'))(wiki);
	}
	return wiki._relink_indexer;
};

/**Relinking supports a cache that persists throughout a whole relink op.
 * This is because the Tiddlywiki caches may get wiped multiple times
 * throughout the course of a relink.
 */
exports.getCacheForRun = function(options, cacheName, initializer) {
	options.cache = options.cache || Object.create(null);
	if (!$tw.utils.hop(options.cache, cacheName)) {
		options.cache[cacheName] = initializer();
	}
	return options.cache[cacheName];
};

/**Returns a specific relinker.
 * This is useful for wikitext rules which need to parse a filter or a list
 */
exports.getType = function(name) {
	var Handler = getFieldTypes()[name];
	return Handler ? new Handler() : undefined;
};

exports.getTypes = function() {
	// We don't return fieldTypes, because we don't want it modified,
	// and we need to filter out legacy names.
	var rtn = Object.create(null);
	for (var type in getFieldTypes()) {
		var typeObject = getFieldTypes()[type];
		rtn[typeObject.typeName] = typeObject;
	}
	return rtn;
};

exports.getDefaultType = function(wiki) {
	var tiddler = wiki.getTiddler("$:/config/flibbles/relink/settings/default-type");
	var defaultType = tiddler && tiddler.fields.text;
	// make sure the default actually exists, otherwise default
	return fieldTypes[defaultType] ? defaultType : "title";
};

var fieldTypes;

function getFieldTypes() {
	if (!fieldTypes) {
		fieldTypes = Object.create(null);
		$tw.modules.forEachModuleOfType("relinkfieldtype", function(title, exports) {
			function NewType() {};
			NewType.prototype = exports;
			NewType.typeName = exports.name;
			fieldTypes[exports.name] = NewType;
			// For legacy, if the NewType doesn't have a report method, we add one
			if (!exports.report) {
				exports.report = function() {};
			}
			// Also for legacy, some of the field types can go by other names
			if (exports.aliases) {
				$tw.utils.each(exports.aliases, function(alias) {
					fieldTypes[alias] = NewType;
				});
			}
		});
	}
	return fieldTypes;
}

var relinkOperators;

function getRelinkOperators() {
	if (!relinkOperators) {
		relinkOperators = exports.getModulesByTypeAsHashmap('relinkoperator', 'name');
	}
	return relinkOperators;
};
