/*\
module-type: relinkwikitextrule

Handles replacement in wiki text inline rules, like,

[img[tiddler.jpg]]

[img width=23 height=24 [Description|tiddler.jpg]]

\*/

var Rebuilder = require("$:/plugins/flibbles/relink/js/utils/rebuilder");
var refHandler = require("$:/plugins/flibbles/relink/js/fieldtypes/reference");
var filterHandler = require("$:/plugins/flibbles/relink/js/utils").getType('filter');
var macrocall = require("./macrocall.js");
var utils = require("./utils.js");

exports.name = "image";

exports.report = function(text, callback, options) {
	var ptr = this.nextImage.start + 4; //[img
	var inSource = false;
	for (var attributeName in this.nextImage.attributes) {
		var attr = this.nextImage.attributes[attributeName];
		if (attributeName === "source" || attributeName === "tooltip") {
			if (inSource) {
				ptr = text.indexOf('|', ptr);
			} else {
				ptr = text.indexOf('[', ptr);
				inSource = true;
			}
			ptr += 1;
		}
		if (attributeName === "source") {
			var tooltip = this.nextImage.attributes.tooltip;
			var blurb = '[img[' + (tooltip ? tooltip.value : '') + ']]';
			callback(attr.value, blurb);
			ptr = text.indexOf(attr.value, ptr);
			ptr = text.indexOf(']]', ptr) + 2;
		} else if (attributeName !== "tooltip") {
			ptr = reportAttribute(this.parser, attr, callback, options);
		}
	}
	this.parser.pos = ptr;
};

exports.relink = function(text, fromTitle, toTitle, options) {
	var ptr = this.nextImage.start,
		builder = new Rebuilder(text, ptr),
		makeWidget = false,
		skipSource = false,
		imageEntry;
	if (this.nextImage.attributes.source.value === fromTitle && !canBePretty(toTitle, this.nextImage.attributes.tooltip)) {
		if (this.parser.context.allowWidgets() && (utils.wrapAttributeValue(toTitle) || options.placeholder)) {
			makeWidget = true;
			builder.add("<$image", ptr, ptr+4);
		} else {
			// We won't be able to make a placeholder to replace
			// the source attribute. We check now so we don't
			// prematurely convert into a widget.
			// Keep going in case other attributes need replacing.
			skipSource = true;
		}
	}
	ptr += 4; //[img
	var inSource = false;
	for (var attributeName in this.nextImage.attributes) {
		var attr = this.nextImage.attributes[attributeName];
		if (attributeName === "source" || attributeName === "tooltip") {
			if (inSource) {
				ptr = text.indexOf('|', ptr);
			} else {
				ptr = text.indexOf('[', ptr);
				inSource = true;
			}
			if (makeWidget) {
				if (" \t\n".indexOf(text[ptr-1]) >= 0) {
					builder.add('', ptr, ptr+1);
				} else {
					builder.add(' ', ptr, ptr+1);
				}
			}
			ptr += 1;
		}
		if (attributeName === "source") {
			ptr = text.indexOf(attr.value, ptr);
			if (attr.value === fromTitle) {
				if (makeWidget) {
					var quotedValue = utils.wrapAttributeValue(toTitle);
					if (quotedValue === undefined) {
						var key = options.placeholder.getPlaceholderFor(toTitle);
						builder.add("source=<<"+key+">>", ptr, ptr+fromTitle.length);
					} else {
						builder.add("source="+quotedValue, ptr, ptr+fromTitle.length);
					}
				} else if (!skipSource) {
					builder.add(toTitle, ptr, ptr+fromTitle.length);
				} else {
					builder.impossible = true;
				}
			}
			ptr = text.indexOf(']]', ptr);
			if (makeWidget) {
				builder.add("/>", ptr, ptr+2);
			}
			ptr += 2;
		} else if (attributeName === "tooltip") {
			if (makeWidget) {
				ptr = text.indexOf(attr.value, ptr);
				var quotedValue = utils.wrapAttributeValue(attr.value);
				builder.add("tooltip="+quotedValue, ptr, ptr+attr.value.length);
			}
		} else {
			ptr = relinkAttribute(this.parser, attr, builder, fromTitle, toTitle, options);
		}
	}
	this.parser.pos = ptr;
	if (builder.changed() || builder.impossible) {
		imageEntry = {
			output: builder.results(ptr),
			impossible: builder.impossible };
	}
	return imageEntry;
};

function reportAttribute(parser, attribute, callback, options) {
	var text = parser.source;
	var ptr = text.indexOf(attribute.name, attribute.start);
	var end;
	ptr += attribute.name.length;
	ptr = text.indexOf('=', ptr);
	if (attribute.type === "string") {
		ptr = text.indexOf(attribute.value, ptr)
		var quote = utils.determineQuote(text, attribute);
		// ignore first quote. We already passed it
		end = ptr + quote.length + attribute.value.length;
	} else if (attribute.type === "indirect") {
		ptr = text.indexOf('{{', ptr);
		var end = ptr + attribute.textReference.length + 4;
		refHandler.report(attribute.textReference, function(title, blurb) {
			callback(title, '[img ' + attribute.name + '={{' + (blurb || '') + '}}]');
		}, options);
	} else if (attribute.type === "filtered") {
		ptr = text.indexOf('{{{', ptr);
		var end = ptr + attribute.filter.length + 6;
		filterHandler.report(attribute.filter, function(title, blurb) {
			callback(title, '[img ' + attribute.name + '={{{' + blurb + '}}}]');
		}, options);
	} else if (attribute.type === "macro") {
		ptr = text.indexOf("<<", ptr);
		var end = attribute.value.end;
		var macro = attribute.value;
		oldValue = attribute.value;
		macrocall.reportAttribute(parser, macro, function(title, blurb) {
			callback(title, '[img ' + attribute.name + '=' + blurb + ']');
		}, options);
	}
	return end;
};

function relinkAttribute(parser, attribute, builder, fromTitle, toTitle, options) {
	var text = builder.text;
	var ptr = text.indexOf(attribute.name, attribute.start);
	var end;
	ptr += attribute.name.length;
	ptr = text.indexOf('=', ptr);
	if (attribute.type === "string") {
		ptr = text.indexOf(attribute.value, ptr)
		var quote = utils.determineQuote(text, attribute);
		// ignore first quote. We already passed it
		end = ptr + quote.length + attribute.value.length;
	} else if (attribute.type === "indirect") {
		ptr = text.indexOf('{{', ptr);
		var end = ptr + attribute.textReference.length + 4;
		var ref = refHandler.relinkInBraces(attribute.textReference, fromTitle, toTitle, options);
		if (ref) {
			if (ref.impossible) {
				builder.impossible = true;
			}
			if (ref.output) {
				builder.add("{{"+ref.output+"}}", ptr, end);
			}
		}
	} else if (attribute.type === "filtered") {
		ptr = text.indexOf('{{{', ptr);
		var end = ptr + attribute.filter.length + 6;
		var filter = filterHandler.relinkInBraces(attribute.filter, fromTitle, toTitle, options);
		if (filter !== undefined) {
			if (filter.impossible) {
				builder.impossible = true;
			}
			if (filter.output) {
				var quoted = "{{{"+filter.output+"}}}";
				builder.add(quoted, ptr, end);
			}
		}
	} else if (attribute.type === "macro") {
		ptr = text.indexOf("<<", ptr);
		var end = attribute.value.end;
		var macro = attribute.value;
		oldValue = attribute.value;
		var macroEntry = macrocall.relinkAttribute(parser, macro, text, fromTitle, toTitle, options);
		if (macroEntry !== undefined) {
			if (macroEntry.impossible) {
				builder.impossible = true;
			}
			if (macroEntry.output) {
				builder.add(macroEntry.output, ptr, end);
			}
		}
	}
	return end;
};

function canBePretty(title, tooltip) {
	return title.indexOf(']') < 0 && (tooltip || title.indexOf('|') < 0);
};
