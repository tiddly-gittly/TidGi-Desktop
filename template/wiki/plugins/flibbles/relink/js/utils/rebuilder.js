/*\

This helper class aids in reconstructing an existing string with new parts.

\*/

function Rebuilder(text, start) {
	this.text = text;
	this.index = start || 0;
	this.pieces = [];
};

module.exports = Rebuilder;

/**Pieces must be added consecutively.
 * Start and end are the indices in the old string specifying where to graft
 * in the new piece.
 */
Rebuilder.prototype.add = function(value, start, end) {
	this.pieces.push(this.text.substring(this.index, start), value);
	this.index = end;
};

Rebuilder.prototype.changed = function() {
	return this.pieces.length > 0;
};

Rebuilder.prototype.results = function(end) {
	if (this.changed()) {
		this.pieces.push(this.text.substring(this.index, end));
		return this.pieces.join('');
	}
	return undefined;
};
