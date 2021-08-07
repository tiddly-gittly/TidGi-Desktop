/*\
module-type: relinkwikitextrule

Handles replacement in attributes of widgets and html elements
This is configurable to select exactly which attributes of which elements
should be changed.

<$link to="TiddlerTitle" />

\*/

var utils = require("./utils.js");
var Rebuilder = require("$:/plugins/flibbles/relink/js/utils/rebuilder");
var relinkUtils = require('$:/plugins/flibbles/relink/js/utils.js');
var refHandler = relinkUtils.getType('reference');
var filterHandler = relinkUtils.getType('filter');
var ImportContext = relinkUtils.getContext('import');
var macrocall = require("./macrocall.js");

exports.name = "html";

exports.report = function(text, callback, options) {
	var managedElement = this.parser.context.getAttribute(this.nextTag.tag);
	var importFilterAttr;
	var element = this.nextTag.tag;
	for (var attributeName in this.nextTag.attributes) {
		var attr = this.nextTag.attributes[attributeName];
		var nextEql = text.indexOf('=', attr.start);
		// This is the rare case of changing tiddler
		// "true" to something else when "true" is
		// implicit, like <$link to /> We ignore those.
		if (nextEql < 0 || nextEql > attr.end) {
			continue;
		}
		if (this.nextTag.tag === "$importvariables" && attributeName === "filter") {
			importFilterAttr = attr;
		}
		var oldLength, quotedValue = undefined, entry;
		if (attr.type === "string") {
			var handler = getAttributeHandler(this.parser.context, this.nextTag, attributeName, options);
			if (!handler) {
				// We don't manage this attribute. Bye.
				continue;
			}
			handler.report(attr.value, function(title, blurb) {
				if (blurb) {
					callback(title, '<' + element + ' ' + attributeName + '="' + blurb + '" />');
				} else {
					callback(title, '<' + element + ' ' + attributeName + ' />');
				}
			}, options);
		} else if (attr.type === "indirect") {
			entry = refHandler.report(attr.textReference, function(title, blurb) {
				callback(title, '<' + element + ' ' + attributeName + '={{' + (blurb || '') + '}} />');
			}, options);
		} else if (attr.type === "filtered") {
			entry = filterHandler.report(attr.filter, function(title, blurb) {
				callback(title, '<' + element + ' ' + attributeName + '={{{' + blurb + '}}} />');
			}, options);
		} else if (attr.type === "macro") {
			var macro = attr.value;
			entry = macrocall.reportAttribute(this.parser, macro, function(title, blurb) {
				callback(title, '<' + element + ' ' + attributeName + '=' + blurb + ' />');
			}, options);
		}
		if (quotedValue === undefined) {
			continue;
		}
		if (this.nextTag.tag === "$importvariables" && attributeName === "filter") {
			// If this is an import variable filter, we gotta
			// remember this new value when we import lower down.
			importFilterAttr = quotedValue;
		}
	}
	if (importFilterAttr) {
		processImportFilter(this.parser, importFilterAttr, options);
	}
	this.parse();
};

exports.relink = function(text, fromTitle, toTitle, options) {
	var managedElement = this.parser.context.getAttribute(this.nextTag.tag),
		builder = new Rebuilder(text, this.nextTag.start);
	var importFilterAttr;
	var widgetEntry = {};
	widgetEntry.attributes = Object.create(null);
	widgetEntry.element = this.nextTag.tag;
	for (var attributeName in this.nextTag.attributes) {
		var attr = this.nextTag.attributes[attributeName];
		var nextEql = text.indexOf('=', attr.start);
		// This is the rare case of changing tiddler
		// "true" to something else when "true" is
		// implicit, like <$link to /> We ignore those.
		if (nextEql < 0 || nextEql > attr.end) {
			continue;
		}
		if (this.nextTag.tag === "$importvariables" && attributeName === "filter") {
			importFilterAttr = attr;
		}
		var oldLength, quotedValue = undefined, entry;
		var nestedOptions = Object.create(options);
		nestedOptions.settings = this.parser.context;
		switch (attr.type) {
		case 'string':
			var handler = getAttributeHandler(this.parser.context, this.nextTag, attributeName, options);
			if (!handler) {
				// We don't manage this attribute. Bye.
				continue;
			}
			entry = handler.relink(attr.value, fromTitle, toTitle, nestedOptions);
			if (entry === undefined) {
				continue;
			}
			if (entry.output) {
				var quote = utils.determineQuote(text, attr);
				oldLength = attr.value.length + (quote.length * 2);
				quotedValue = utils.wrapAttributeValue(entry.output,quote);
				if (quotedValue === undefined) {
					// The value was unquotable. We need to make
					// a macro in order to replace it.
					if (!options.placeholder) {
						// but we can't...
						entry.impossible = true;
					} else {
						var value = options.placeholder.getPlaceholderFor(entry.output,handler.name)
						quotedValue = "<<"+value+">>";
					}
				}
			}
			break;
		case 'indirect':
			entry = refHandler.relinkInBraces(attr.textReference, fromTitle, toTitle, options);
			if (entry === undefined) {
				continue;
			}
			if (entry.output) {
				// +4 for '{{' and '}}'
				oldLength = attr.textReference.length + 4;
				quotedValue = "{{"+entry.output+"}}";
			}
			break;
		case 'filtered':
			entry = filterHandler.relinkInBraces(attr.filter, fromTitle, toTitle, options);
			if (entry === undefined) {
				continue;
			}
			if (entry.output) {
				// +6 for '{{{' and '}}}'
				oldLength = attr.filter.length + 6;
				quotedValue = "{{{"+ entry.output +"}}}";
			}
			break;
		case 'macro':
			var macro = attr.value;
			entry = macrocall.relinkAttribute(this.parser, macro, text, fromTitle, toTitle, options);
			if (entry === undefined) {
				continue;
			}
			if (entry.output) {
				// already includes '<<' and '>>'
				oldLength = macro.end-macro.start;
				quotedValue = entry.output;
			}
		}
		if (entry.impossible) {
			widgetEntry.impossible = true;
		}
		if (quotedValue === undefined) {
			continue;
		}
		if (this.nextTag.tag === "$importvariables" && attributeName === "filter") {
			// If this is an import variable filter, we gotta
			// remember this new value when we import lower down.
			importFilterAttr = quotedValue;
		}
		// We count backwards from the end to preserve whitespace
		var valueStart = attr.end - oldLength;
		builder.add(quotedValue, valueStart, attr.end);
	}
	if (importFilterAttr) {
		processImportFilter(this.parser, importFilterAttr, options);
	}
	var tag = this.parse()[0];
	if (tag.children) {
		for (var i = 0; i < tag.children.length; i++) {
			var child = tag.children[i];
			if (child.output) {
				builder.add(child.output, child.start, child.end);
			}
			if (child.impossible) {
				widgetEntry.impossible = true;
			}
		}
	}
	if (builder.changed() || widgetEntry.impossible) {
		widgetEntry.output = builder.results(this.parser.pos);
		return widgetEntry;
	}
	return undefined;
};

/** Returns the field handler for the given attribute of the given widget.
 *  If this returns undefined, it means we don't handle it. So skip.
 */
function getAttributeHandler(context, widget, attributeName, options) {
	if (widget.tag === "$macrocall") {
		var nameAttr = widget.attributes["$name"];
		if (nameAttr) {
			var macro = context.getMacro(nameAttr.value);
			if (macro) {
				return macro[attributeName];
			}
		}
	} else {
		var element = context.getAttribute(widget.tag);
		if (element) {
			return element[attributeName];
		}
	}
	return undefined;
};

function computeAttribute(context, attribute, options) {
	var value;
	if(attribute.type === "filtered") {
		var parentWidget = context.widget;
		value = options.wiki.filterTiddlers(attribute.filter,parentWidget)[0] || "";
	} else if(attribute.type === "indirect") {
		var parentWidget = context.widget;
		value = options.wiki.getTextReference(attribute.textReference,"",parentWidget.variables.currentTiddler.value);
	} else if(attribute.type === "macro") {
		var parentWidget = context.widget;
		value = parentWidget.getVariable(attribute.value.name,{params: attribute.value.params});
	} else { // String attribute
		value = attribute.value;
	}
	return value;
};

// This processes a <$importvariables> filter attribute and adds any new
// variables to our parser.
function processImportFilter(parser, importAttribute, options) {
	if (typeof importAttribute === "string") {
		// It was changed. Reparse it. It'll be a quoted
		// attribute value. Add a dummy attribute name.
		importAttribute = $tw.utils.parseAttribute("p="+importAttribute, 0)
	}
	var context = parser.context;
	var importFilter = computeAttribute(context, importAttribute, options);
	parser.context = new ImportContext(options.wiki, context, importFilter);
};
