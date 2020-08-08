/*\
module-type: relinkwikitextrule

Handles replacement of transclusions in wiki text like,

{{RenamedTiddler}}
{{RenamedTiddler||TemplateTitle}}

This renames both the tiddler and the template field.

\*/

var refHandler = require("$:/plugins/flibbles/relink/js/fieldtypes/reference");
var utils = require("./utils.js");

exports.name = ['transcludeinline', 'transcludeblock'];

var TranscludeEntry = function() {};
TranscludeEntry.prototype.name = "transclude";
TranscludeEntry.prototype.report = function() {
	var ref = this.reference || {};
	var output = [];
	if (this.referenceChanged) {
		var suffix = "";
		if (ref.field) {
			suffix = "!!" + ref.field;
		}
		if (ref.index) {
			suffix = "##" + ref.index;
		}
		if (this.template) {
			suffix = suffix + "||" + this.template;
		}
		output.push("{{" + suffix + "}}");
	}
	if (this.templateChanged) {
		// Must be template
		var refString = refHandler.toString(ref);
		output.push("{{" + refString + "||}}");
	}
	return output;
};

exports.relink = function(text, fromTitle, toTitle, options) {
	var m = this.match,
		reference = $tw.utils.parseTextReference(m[1]),
		template = m[2],
		entry = new TranscludeEntry(),
		modified = false;
	this.parser.pos = this.matchRegExp.lastIndex;
	if ($tw.utils.trim(reference.title) === fromTitle) {
		// preserve user's whitespace
		reference.title = reference.title.replace(fromTitle, toTitle);
		modified = true;
		entry.referenceChanged = true;
	}
	if ($tw.utils.trim(template) === fromTitle) {
		template = template.replace(fromTitle, toTitle);
		modified = true;
		entry.templateChanged = true;
	}
	if (modified) {
		entry.reference = reference;
		entry.template = template;
		var output = this.makeTransclude(reference, template, options);
		if (output) {
			// Adding any newline that might have existed is
			// what allows this relink method to work for both
			// the block and inline filter wikitext rule.
			output = output + utils.getEndingNewline(m[0]);
			entry.output = output;
		} else {
			entry.impossible = true;
		}
		return entry;
	}
	return undefined;
};

/** This converts a reference and a template into a string representation
 *  of a transclude.
 */
exports.makeTransclude = function(reference, template, options) {
	var rtn;
	if (!canBePrettyTemplate(template)) {
		if (!options.noWidgets) {
			var resultTemplate = wrap(template, options);
			if (resultTemplate !== undefined) {
				if (reference.title) {
					var resultTitle = wrap(reference.title, options);
					var attrs = transcludeAttributes(reference.field, reference.index, options);
					if (resultTitle !== undefined && attrs !== undefined) {
						rtn = "<$tiddler tiddler="+resultTitle+"><$transclude tiddler="+resultTemplate+attrs+"/></$tiddler>";
					}
				} else {
					rtn = "<$transclude tiddler="+resultTemplate+"/>";
				}
			}
		}
	} else if (!canBePrettyTitle(reference.title)) {
		if (!options.noWidgets) {
			// This block and the next account for the 1%...
			var resultTitle = wrap(reference.title, options);
			if (resultTitle !== undefined) {
				var reducedRef = {field: reference.field, index: reference.index};
				rtn = "<$tiddler tiddler="+resultTitle+">"+prettyTransclude(reducedRef, template)+"</$tiddler>";
			}
		}
	} else {
		// This block takes care of 99% of all cases
		rtn = prettyTransclude(reference, template);
	}
	return rtn;
};

function wrap(tiddler, options) {
	tiddler = $tw.utils.trim(tiddler);
	var result = utils.wrapAttributeValue(tiddler);
	if (result === undefined) {
		if (options.placeholder) {
			result = "<<" + options.placeholder.getPlaceholderFor(tiddler, undefined, options) + ">>";
		}
	}
	return result;
};

function canBePrettyTitle(value) {
	return refHandler.canBePretty(value) && canBePrettyTemplate(value);
};

function canBePrettyTemplate(value) {
	return !value || (value.indexOf('}') < 0 && value.indexOf('{') < 0 && value.indexOf('|') < 0);
};

/**Returns attributes for a transclude widget.
 * only field or index should be used, not both, but both will return
 * the intuitive (albeit useless) result.
 */
function transcludeAttributes(field, index, options) {
	var rtn = [
		wrapAttribute("field", field, options),
		wrapAttribute("index", index, options)
	];
	if (rtn[0] === undefined || rtn[1] === undefined) {
		// This can only happen if the transclude is using an
		// illegal key.
		return undefined;
	}
	return rtn.join('');
};

function wrapAttribute(name, value, options) {
	if (value) {
		var wrappedValue = utils.wrapAttributeValue(value);
		if (wrappedValue === undefined) {
			if (!options.placeholder) {
				return undefined;
			}
			wrappedValue = "<<"+options.placeholder.getPlaceholderFor(value, name, options)+">>";
		}
		return " "+name+"="+wrappedValue;
	}
	return '';
};

function prettyTransclude(textReference, template) {
	if (typeof textReference !== "string") {
		textReference = refHandler.toString(textReference);
	}
	if (!textReference) {
		textReference = '';
	}
	if (template !== undefined) {
		return "{{"+textReference+"||"+template+"}}";
	} else {
		return "{{"+textReference+"}}";
	}
};
