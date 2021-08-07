/*\
module-type: relinkfilteroperator

Given a title as an operand, returns a string for each occurrence of that title
within each input title.

[[title]] +[relink:report[fromTiddler]]`

Returns string representation of fromTiddler occurrences in title.
\*/

exports.report = function(source,operator,options) {
	var fromTitle = operator.operand,
		results = [];
	if (fromTitle) {
		var blurbs = options.wiki.getTiddlerRelinkBackreferences(fromTitle);
		source(function(tiddler, title) {
			if (blurbs[title]) {
				results = results.concat(blurbs[title]);
			}
		});
	}
	return results;
};
