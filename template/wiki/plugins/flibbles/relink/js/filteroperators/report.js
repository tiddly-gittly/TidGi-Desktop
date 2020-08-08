/*\
module-type: relinkfilteroperator

Given a title as an operand, returns a string for each occurrence of that title
within each input title.

[[title]] +[relink:report[fromTiddler]]`

Returns string representation of fromTiddler occurrences in title.
\*/

exports.report = function(source,operator,options) {
	var fromTitle = operator.operand,
		results = [],
		records = options.wiki.getRelinkReport(
			fromTitle, fromTitle, options);
	if (fromTitle) {
		source(function(tiddler, title) {
			var affectedFields = records[title];
			if (affectedFields) {
				for (var field in affectedFields) {
					var entry = affectedFields[field];
					var signatures = entry.report();
					results = results.concat(signatures);
				}
			}
		});
	}
	return results;
};
