/*\
module-type: relinkwikitextrule

Handles replacement of filtered transclusions in wiki text like,

{{{ [tag[docs]] }}}
{{{ [tag[docs]] |tooltip}}}
{{{ [tag[docs]] ||TemplateTitle}}}
{{{ [tag[docs]] |tooltip||TemplateTitle}}}
{{{ [tag[docs]] }}width:40;height:50;}.class.class

This renames both the list and the template field.

\*/

exports.name = ['filteredtranscludeinline', 'filteredtranscludeblock'];

var filterHandler = require("$:/plugins/flibbles/relink/js/utils").getType('filter');
var utils = require("./utils.js");

exports.report = function(text, callback, options) {
	var m = this.match,
		filter = m[1],
		template = $tw.utils.trim(m[3]),
		append = template ? '||' + template + '}}}' : '}}}';
	filterHandler.report(filter, function(title, blurb) {
		callback(title, '{{{' + blurb + append);
	}, options);
	if (template) {
		callback(template, '{{{' + $tw.utils.trim(filter).replace(/\r?\n/mg, ' ') + '||}}}');
	}
	this.parser.pos = this.matchRegExp.lastIndex;
};

exports.relink = function(text, fromTitle, toTitle, options) {
	var m = this.match,
		filter = m[1],
		tooltip = m[2],
		template = m[3],
		style = m[4],
		classes = m[5],
		parser = this.parser,
		entry = {};
	parser.pos = this.matchRegExp.lastIndex;
	var modified = false;

	var filterEntry = filterHandler.relink(filter, fromTitle, toTitle, options);
	if (filterEntry !== undefined) {
		if (filterEntry.output) {
			filter = filterEntry.output;
			modified = true;
		}
		if (filterEntry.impossible) {
			entry.impossible = true;
		}
	}

	if ($tw.utils.trim(template) === fromTitle) {
		// preserves user-inputted whitespace
		template = template.replace(fromTitle, toTitle);
		modified = true;
	}
	if (!modified) {
		if (!entry.impossible) {
			return undefined;
		}
	} else {
		var output = this.makeFilteredtransclude(this.parser, filter, tooltip, template, style, classes);
		if (output === undefined) {
			entry.impossible = true;
		} else {
			// By copying over the ending newline of the original
			// text if present, thisrelink method thus works for
			// both the inline and block rule
			entry.output = output + utils.getEndingNewline(m[0]);
		}
	}
	return entry;
};

exports.makeFilteredtransclude = function(parser, filter, tooltip, template, style, classes) {
	if (canBePretty(filter) && canBePrettyTemplate(template)) {
		return prettyList(filter, tooltip, template, style, classes);
	}
	if (classes !== undefined) {
		classes = classes.split('.').join(' ');
	}
	return utils.makeWidget(parser, '$list', {
		filter: filter,
		tooltip: tooltip,
		template: template,
		style: style || undefined,
		itemClass: classes});
};

function prettyList(filter, tooltip, template, style, classes) {
	if (tooltip === undefined) {
		tooltip = '';
	} else {
		tooltip = "|" + tooltip;
	}
	if (template === undefined) {
		template = '';
	} else {
		template = "||" + template;
	}
	if (classes === undefined) {
		classes = '';
	} else {
		classes = "." + classes;
	}
	style = style || '';
	return "{{{"+filter+tooltip+template+"}}"+style+"}"+classes;
};

function canBePretty(filter) {
	return filter.indexOf('|') < 0 && filter.indexOf('}}') < 0;
};

function canBePrettyTemplate(template) {
	return !template || (
		template.indexOf('|') < 0
		&& template.indexOf('{') < 0
		&& template.indexOf('}') < 0);
};
