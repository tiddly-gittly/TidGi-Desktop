/*\
module-type: library

This handles the fetching and distribution of relink settings.

\*/

var settings = require('$:/plugins/flibbles/relink/js/settings.js');
var Widget = require("$:/core/modules/widgets/widget.js").widget;

function MacroConfig(wiki, parent, title) {
	this.macros = Object.create(null);
	this.parent = parent;
	this.title = title;
	this.wiki = wiki;
	this.widgetList = [];
	this.reservedmacroNames = Object.create(null);
};

module.exports = MacroConfig;

MacroConfig.prototype.import = function(filter) {
	var parentWidget;
	if (this.parent) {
		parentWidget = this.getVariableWidget();
	}
	var importWidget = createImportWidget(filter, this.wiki, parentWidget);
	this._compileList(importWidget.tiddlerList);
	this.widgetList.push(importWidget);
	// This only works if only one filter is imported
	this.addWidget(importWidget);
};

MacroConfig.prototype.refresh = function(changes) {
	this.parent.refresh(changes);
	if (this.widget.refresh(changes)) {
		this.macros = Object.create(null);
		// Recompile all our widgets in the same order
		for (var i = 0; i < this.widgetList.length; i++) {
			this._compileList(this.widgetList[i].tiddlerList );
		}
		return true;
	}
	return false;
};

// So fieldtypes can access settings through options.settings, instead of
// including this file, which they can't, because that'd be cyclical dependency
MacroConfig.prototype.getType = function(name) {
	return settings.getType(name);
};

// This class does no special handling of fields, operators, or attributes.
// we pass it along to the parent.
MacroConfig.prototype.getFields = function() {
	return this.parent.getFields();
};

MacroConfig.prototype.getOperators = function() {
	return this.parent.getOperators();
};

MacroConfig.prototype.getAttributes = function() {
	return this.parent.getAttributes();
};

MacroConfig.prototype.survey = function(text, fromTitle, options) {
	return this.parent.survey(text, fromTitle, options);
};

MacroConfig.prototype.getAttribute = function(elementName) {
	return this.parent.getAttribute(elementName);
};

MacroConfig.prototype.getMacros = function() {
	var signatures = this.parent.getMacros();
	for (var macroName in this.macros) {
		var macro = this.macros[macroName];
		for (var param in macro) {
			signatures[macroName + "/" + param] = macro[param];
		}
	}
	return signatures;
};

// But macro we handle differently.
MacroConfig.prototype.getMacro = function(macroName) {
	var theseSettings = this.macros[macroName];
	var parentSettings;
	if (this.parent) {
		parentSettings = this.parent.getMacro(macroName);
	}
	if (theseSettings && parentSettings) {
		// gotta merge them without changing either. This is expensive,
		// but it'll happen rarely.
		var rtnSettings = $tw.utils.extend(Object.create(null), theseSettings, parentSettings);
		return rtnSettings;
	}
	return theseSettings || parentSettings;
};

MacroConfig.prototype.addSetting = function(macroName, parameter, type, sourceTitle) {
	var macro = this.macros[macroName];
	type = type || settings.getDefaultType(this.wiki);
	if (macro === undefined) {
		macro = this.macros[macroName] = Object.create(null);
	}
	var handler = settings.getType(type);
	if (handler) {
		handler.source = sourceTitle;
		// We attach the fields of the defining tiddler for the benefit
		// of any 3rd party field types that want access to them.
		var tiddler = this.wiki.getTiddler(sourceTitle);
		handler.fields = tiddler.fields;
		macro[parameter] = handler;
	}
};

MacroConfig.prototype.createChildLibrary = function(title) {
	return new MacroConfig(this.wiki, this, title);
};

MacroConfig.prototype.addWidget = function(widget) {
	this.widget = widget;
	while (this.widget.children.length > 0) {
		this.widget = this.widget.children[0];
	}
};

MacroConfig.prototype.getVariableWidget = function() {
	if (!this.widget) {
		var varWidget = this.parent && this.parent.widget;
		var parentWidget = new Widget({}, {parentWidget: varWidget});
		parentWidget.setVariable("currentTiddler", this.title);
		var widget = new Widget({}, {parentWidget: parentWidget});
		this.addWidget(widget);
	}
	return this.widget;
};

/**This takes macros, specifically relink placeholders, and remembers them
 * It creates a dummy object for them, since we'll never need the definition
 */
MacroConfig.prototype.reserveMacroName = function(variableName) {
	this.reservedmacroNames[variableName] = {
		value: "",
		params: []};
};

MacroConfig.prototype.addMacroDefinition = function(setParseTreeNode) {
	var bottomWidget = this.getVariableWidget();
	var setWidget = bottomWidget.makeChildWidget(setParseTreeNode);
	setWidget.computeAttributes();
	setWidget.execute();
	this.addWidget(setWidget);
};

MacroConfig.prototype.getMacroDefinition = function(variableName) {
	return this.getVariableWidget().variables[variableName] || $tw.macros[variableName] || this.reservedmacroNames[variableName];
};

function createImportWidget(filter, wiki, parent) {
	var widget = wiki.makeWidget( { tree: [{
		type: "importvariables",
		attributes: {
			"filter": {
				type: "string",
				value: filter
			}
		}
	}] }, { parentWidget: parent} );
	widget.execute();
	widget.renderChildren();
	var importWidget = widget.children[0];
	return importWidget;
};

MacroConfig.prototype._compileList = function(titleList) {
	for (var i = 0; i < titleList.length; i++) {
		var parser = this.wiki.parseTiddler(titleList[i]);
		if (parser) {
			var parseTreeNode = parser.tree[0];
			while (parseTreeNode && parseTreeNode.type === "set") {
				if (parseTreeNode.relink) {
					for (var macroName in parseTreeNode.relink) {
						var parameters = parseTreeNode.relink[macroName];
						for (paramName in parameters) {
							this.addSetting(macroName, paramName, parameters[paramName], titleList[i]);
						}
					}
				}
				parseTreeNode = parseTreeNode.children && parseTreeNode.children[0];
			}
		}
	}
};
