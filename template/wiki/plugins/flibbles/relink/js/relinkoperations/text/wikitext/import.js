/*\
module-type: relinkwikitextrule

Handles import pragmas

\import [tag[MyTiddler]]
\*/

var settings = require("$:/plugins/flibbles/relink/js/settings.js");
var filterRelinker = settings.getType('filter');

exports.name = "import";

function ImportEntry(filterEntry) {
	this.filter = filterEntry;
};
ImportEntry.prototype.name = "import";
ImportEntry.prototype.eachChild = function(block) { return block(this.filter);};
ImportEntry.prototype.report = function() {
	return this.filter.report().map(function(report) {
		if (report.length > 0) {
			return "\\import " + report;
		} else {
			return "\\import";
		}
	});
};

exports.relink = function(text, fromTitle, toTitle, options) {
	// In this one case, I'll let the parser parse out the filter and move
	// the ptr.
	var start = this.matchRegExp.lastIndex;
	var parseTree = this.parse();
	var filter = parseTree[0].attributes.filter.value;
	var entry = undefined;
	var filterEntry = filterRelinker.relink(filter, fromTitle, toTitle, options);
	if (filterEntry !== undefined) {
		entry = new ImportEntry(filterEntry);
		var newline = text.substring(start+filter.length, this.parser.pos);
		if (filterEntry.output) {
			filter = filterEntry.output;
			entry.output = "\\import " + filter + newline;
		}
	}

	// Before we go, we need to actually import the variables
	// it's calling for, and any /relink pragma
	options.settings.import(filter);

	return entry;
};
