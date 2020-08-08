/*\
module-type: relinkfilteroperator

This filter is meant for internal Relink use only, thus it's
undocumented and subject to change. Also, it's really not great.

Given an input of targets, (possibly just one), outputs all the tiddlers in
which Relink would fail to update <<currentTiddler>> to the operand in ALL
cases.

`[all[tiddlers+system]relink:impossible<toTiddler>]`

\*/

var language = require("$:/plugins/flibbles/relink/js/language.js");

exports.impossible = function(source,operator,options) {
	var from = options.widget && options.widget.getVariable("currentTiddler");
	var to = operator.operand,
		results = [];
	if (from) {
		var records = options.wiki.getRelinkReport(
			from, to, options);
		source(function(tiddler, title) {
			var fields = records[title];
			if (fields) {
				var impossible = false;
				for (var field in fields) {
					language.eachImpossible(fields[field], function() {
						impossible = true;
					});
				}
				if (impossible) {
					results.push(title);
				}
			}
		});
	}
	return results;
};
