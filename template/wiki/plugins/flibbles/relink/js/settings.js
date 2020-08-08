/*\
module-type: library

This handles the fetching and distribution of relink settings.

\*/

var fieldTypes = Object.create(null);
var surveyors = [];
var prefix = "$:/config/flibbles/relink/";

$tw.modules.forEachModuleOfType("relinkfieldtype", function(title, exports) {
	function NewType() {};
	NewType.prototype = exports;
	NewType.typeName = exports.name;
	fieldTypes[exports.name] = NewType;
	// For legacy reasons, some of the field types can go by other names
	if (exports.aliases) {
		$tw.utils.each(exports.aliases, function(alias) {
			fieldTypes[alias] = NewType;
		});
	}
});

$tw.modules.forEachModuleOfType("relinksurveyor", function(title, exports) {
	surveyors.push(exports);
});

function Settings(wiki) {
	this.settings = compileSettings(wiki);
	this.wiki = wiki;
};

module.exports = Settings;

/**Returns a specific relinker.
 * This is useful for wikitext rules which need to parse a filter or a list
 */
Settings.getType = function(name) {
	var Handler = fieldTypes[name];
	return Handler ? new Handler() : undefined;
};

Settings.getTypes = function() {
	// We don't return fieldTypes, because we don't want it modified,
	// and we need to filter out legacy names.
	var rtn = Object.create(null);
	for (var type in fieldTypes) {
		var typeObject = fieldTypes[type];
		rtn[typeObject.typeName] = typeObject;
	}
	return rtn;
};

Settings.getDefaultType = function(wiki) {
	var tiddler = wiki.getTiddler("$:/config/flibbles/relink/settings/default-type");
	var defaultType = tiddler && tiddler.fields.text;
	// make sure the default actually exists, otherwise default
	return fieldTypes[defaultType] ? defaultType : "title";
};

Settings.prototype.survey = function(text, fromTitle, options) {
	if (text) {
		for (var i = 0; i < surveyors.length; i++) {
			if (surveyors[i].survey(text, fromTitle, options)) {
				return true;
			}
		}
	}
	return false;
};

Settings.prototype.getAttribute = function(elementName) {
	return this.settings.attributes[elementName];
};

Settings.prototype.getAttributes = function() {
	return flatten(this.settings.attributes);
};


Settings.prototype.getFields = function() {
	return this.settings.fields;
};

Settings.prototype.getOperators = function() {
	return this.settings.operators;
};

Settings.prototype.getMacro = function(macroName) {
	return this.settings.macros[macroName];
};

Settings.prototype.getMacros = function() {
	return flatten(this.settings.macros);
};

Settings.prototype.refresh = function(changes) {
	for (var title in changes) {
		if (title.substr(0, prefix.length) === prefix) {
			this.settings = compileSettings(this.wiki);
			return true;
		}
	}
	return false;
};

/**Factories define methods that create settings given config tiddlers.
 * for factory method 'example', it will be called once for each:
 * "$:/config/flibbles/relink/example/..." tiddler that exists.
 * the argument "key" will be set to the contents of "..."
 *
 * The reason I build relink settings in this convoluted way is to minimize
 * the number of times tiddlywiki has to run through EVERY tiddler looking
 * for relink config tiddlers.
 *
 * Also, by exporting "factories", anyone who extends relink can patch in
 * their own factory methods to create settings that are generated exactly
 * once per rename.
 */
exports.factories = {
	attributes: function(attributes, data, key) {
		var elem = root(key);
		var attr = key.substr(elem.length+1);
		attributes[elem] = attributes[elem] || Object.create(null);
		attributes[elem][attr] = data;
	},
	fields: function(fields, data, name) {
		fields[name] = data;
	},
	macros: function(macros, data, key) {
		// We take the last index, not the first, because macro
		// parameters can't have slashes, but macroNames can.
		var name = dir(key);
		var arg = key.substr(name.length+1);
		macros[name] = macros[name] || Object.create(null);
		macros[name][arg] = data;
	},
	operators: function(operators, data, name) {
		operators[name] = data;
	}
};

function compileSettings(wiki) {
	var settings = Object.create(null);
	for (var name in exports.factories) {
		settings[name] = Object.create(null);
	}
	wiki.eachShadowPlusTiddlers(function(tiddler, title) {
		if (title.substr(0, prefix.length) === prefix) {
			var remainder = title.substr(prefix.length);
			var category = root(remainder);
			var factory = exports.factories[category];
			if (factory) {
				var name = remainder.substr(category.length+1);
				var Handler = fieldTypes[tiddler.fields.text];
				if (Handler) {
					var data = new Handler();
					data.source = title;
					// Secret feature. You can access a config tiddler's
					// fields from inside the fieldtype handler. Cool
					// tricks can be done with this.
					data.fields = tiddler.fields;
					factory(settings[category], data, name);
				}
			}
		}
	});
	return settings;
};

/* Returns first bit of a path. path/to/tiddler -> path
 */
function root(string) {
	var index = string.indexOf('/');
	if (index >= 0) {
		return string.substr(0, index);
	}
};

/* Returns all but the last bit of a path. path/to/tiddler -> path/to
 */
function dir(string) {
	var index = string.lastIndexOf('/');
	if (index >= 0) {
		return string.substr(0, index);
	}
}

function flatten(set) {
	var signatures = Object.create(null);
	for (var outerName in set) {
		var setItem = set[outerName];
		for (var innerName in setItem) {
			signatures[outerName + "/" + innerName] = setItem[innerName];
		}
	}
	return signatures;
};
