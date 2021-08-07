/*\
module-type: relinkfilteroperator

wouldchange: Generator.

Given each input title, it returns all the tiddlers that would be changed if the currentTiddler were to be renamed to the operand.

impossible: filters all source titles for ones that encounter errors on failure.

THESE ARE INTERNAL FILTER OPERATOR AND ARE NOT INTENDED TO BE USED BY USERS.

\*/

var language = require("$:/plugins/flibbles/relink/js/language.js");
var utils = require("$:/plugins/flibbles/relink/js/utils.js");

exports.wouldchange = function(source,operator,options) {
	var from = options.widget && options.widget.getVariable("currentTiddler"),
		to = operator.operand,
		indexer = utils.getIndexer(options.wiki),
		records = indexer.relinkLookup(from, to, options);
	return Object.keys(records);
};

exports.impossible = function(source,operator,options) {
	var from = options.widget && options.widget.getVariable("currentTiddler"),
		to = operator.operand,
		results = [],
		indexer = utils.getIndexer(options.wiki),
		records = indexer.relinkLookup(from, to, options);
	source(function(tiddler, title) {
		var fields = records[title];
		if (fields) {
			for (var field in fields) {
				if (fields[field].impossible) {
					results.push(title);
				}
			}
		}
	});
	return results;
};
