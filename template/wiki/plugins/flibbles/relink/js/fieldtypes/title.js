/*\
This specifies logic for replacing a single-tiddler field. This is the
simplest kind of field type. One title swaps out for the other.
\*/

// NOTE TO MODDERS: If you're making your own field types, the name must be
//                  alpha characters only.
exports.name = 'title';

exports.report = function(value, callback, options) {
	callback(value);
};

/**Returns undefined if no change was made.
 */
exports.relink = function(value, fromTitle, toTitle, options) {
	if (value === fromTitle) {
		return {output: toTitle};
	}
	return undefined;
};

// This is legacy support for when 'title' was known as 'field'
exports.aliases = ['field', 'yes'];
