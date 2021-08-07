/*\

This is a virtual subclass of context for contexts that exist within widgets
of a specific tiddler.

All widget contexts must have a widget member.

\*/

var Context = require('./context.js').context;
var utils = require('$:/plugins/flibbles/relink/js/utils.js');

function WidgetContext() {};

exports.widget = WidgetContext;

WidgetContext.prototype = new Context();

WidgetContext.prototype.getMacroDefinition = function(variableName) {
	// widget.variables is prototyped, so it looks up into all its parents too
	return this.widget.variables[variableName] || $tw.macros[variableName];
};

WidgetContext.prototype.addSetting = function(wiki, macroName, parameter, type, sourceTitle) {
	this.macros = this.macros || Object.create(null);
	var macro = this.macros[macroName];
	type = type || utils.getDefaultType(wiki);
	if (macro === undefined) {
		macro = this.macros[macroName] = Object.create(null);
	}
	var handler = utils.getType(type);
	if (handler) {
		handler.source = sourceTitle;
		// We attach the fields of the defining tiddler for the benefit
		// of any 3rd party field types that want access to them.
		var tiddler = wiki.getTiddler(sourceTitle);
		handler.fields = tiddler.fields;
		macro[parameter] = handler;
	}
};

WidgetContext.prototype.getMacros = function() {
	var signatures = this.parent.getMacros();
	if (this.macros) {
		for (var macroName in this.macros) {
			var macro = this.macros[macroName];
			for (var param in macro) {
				signatures[macroName + "/" + param] = macro[param];
			}
		}
	}
	return signatures;
};

/**This does strange handling because it's possible for a macro to have
 * its individual parameters whitelisted in separate places.
 * Don't know WHY someone would do this, but it can happen.
 */
WidgetContext.prototype.getMacro = function(macroName) {
	var theseSettings = this.macros && this.macros[macroName];
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

/**Returns the deepest descendant of the given widget.
 */
WidgetContext.prototype.getBottom = function(widget) {
	while (widget.children.length > 0) {
		widget = widget.children[0];
	}
	return widget;
};
