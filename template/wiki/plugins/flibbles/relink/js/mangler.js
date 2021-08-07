/*\
module-type: widget

Creates a mangler widget for field validation. This isn't meant to be used
by the user. It's only used in Relink configuration.

\*/

var Widget = require("$:/core/modules/widgets/widget.js").widget;
var language = require('$:/plugins/flibbles/relink/js/language.js');
var utils = require('$:/plugins/flibbles/relink/js/utils.js');

var RelinkManglerWidget = function(parseTreeNode,options) {
	this.initialise(parseTreeNode,options);
	this.addEventListeners([
		{type: "relink-add-field", handler: "handleAddFieldEvent"},
		{type: "relink-add-operator", handler: "handleAddOperatorEvent"},
		{type: "relink-add-parameter", handler: "handleAddParameterEvent"},
		{type: "relink-add-attribute", handler: "handleAddAttributeEvent"}
	]);
};

exports.relinkmangler = RelinkManglerWidget;

RelinkManglerWidget.prototype = new Widget();

// This wraps alert so it can be monkeypatched during testing.
RelinkManglerWidget.prototype.alert = function(message) {
	alert(message);
};

RelinkManglerWidget.prototype.handleAddFieldEvent = function(event) {
	var param = event.paramObject;
	if (typeof param !== "object" || !param.field) {
		// Can't handle it.
		return true;
	}
	var trimmedName = param.field.toLowerCase().trim();
	if (!trimmedName) {
		// Still can't handle it, but don't warn.
		return true;
	}
	if(!$tw.utils.isValidFieldName(trimmedName)) {
		this.alert($tw.language.getString(
			"InvalidFieldName",
			{variables:
				{fieldName: trimmedName}
			}
		));
	} else {
		add(this.wiki, "fields", trimmedName);
	}
	return true;
};

/**Not much validation, even though there are definitely illegal
 * operator names. If you input on, Relink won't relink it, but it
 * won't choke on it either. Tiddlywiki will...
 */
RelinkManglerWidget.prototype.handleAddOperatorEvent = function(event) {
	var param = event.paramObject;
	if (param) {
		add(this.wiki, "operators", param.operator);
	}
	return true;
};

RelinkManglerWidget.prototype.handleAddParameterEvent = function(event) {
	var param = event.paramObject;
	if (param && param.macro && param.parameter) {
		if (/\s/.test(param.macro.trim())) {
			this.alert(language.getString(
				"Error/InvalidMacroName",
				{ variables: {macroName: param.macro},
				  wiki: this.wiki
				}
			));
		} else if (/[ \/]/.test(param.parameter.trim())) {
			this.alert(language.getString(
				"Error/InvalidParameterName",
				{ variables: {parameterName: param.parameter},
				  wiki: this.wiki
				}
			));
		} else {
			add(this.wiki, "macros", param.macro, param.parameter);
		}
	}
	return true;
};

RelinkManglerWidget.prototype.handleAddAttributeEvent = function(event) {
	var param = event.paramObject;
	if (param && param.element && param.attribute) {
		if (/[ \/]/.test(param.element.trim())) {
			this.alert(language.getString(
				"Error/InvalidElementName",
				{ variables: {elementName: param.element},
				  wiki: this.wiki
				}
			));
		} else if (/[ \/]/.test(param.attribute.trim())) {
			this.alert(language.getString(
				"Error/InvalidAttributeName",
				{ variables: {attributeName: param.attribute},
				  wiki: this.wiki
				}
			));
		} else {
			add(this.wiki, "attributes", param.element, param.attribute);
		}
	}
	return true;
};

function add(wiki, category/*, path parts*/) {
	var path = "$:/config/flibbles/relink/" + category;
	for (var x = 2; x < arguments.length; x++) {
		var part = arguments[x];
		// Abort if it's falsy, or only whitespace. Also, trim spaces
		if (!part || !(part = part.trim())) {
			return;
		}
		path = path + "/" + part;
	}
	var def = utils.getDefaultType(wiki);
	wiki.addTiddler({title: path, text: def});
};
