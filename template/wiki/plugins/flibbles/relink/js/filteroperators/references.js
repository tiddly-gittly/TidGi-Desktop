/*\
module-type: relinkfilteroperator

Given a title as an operand, returns all non-shadow tiddlers that have any
sort of updatable reference to it.

`relink:backreferences[]]`
`relink:references[]]`

Returns all tiddlers that reference `fromTiddler` somewhere inside them.

Input is ignored. Maybe it shouldn't do this.
\*/

var LinkedList = $tw.utils.LinkedList;

if (!LinkedList) {
	/* If the linked list isn't available, make a quick crappy version. */
	LinkedList = function() {this.array=[];};

	LinkedList.prototype.pushTop = function(array) {
		$tw.utils.pushTop(this.array, array);
	};

	LinkedList.prototype.toArray = function() {
		return this.array;
	};
};

exports.backreferences = function(source,operator,options) {
	var results = new LinkedList();
	source(function(tiddler,title) {
		results.pushTop(Object.keys(options.wiki.getTiddlerRelinkBackreferences(title,options)));
	});
	return results.toArray();
};

exports.references = function(source,operator,options) {
	var results = new LinkedList();
	source(function(tiddler,title) {
		var refs = options.wiki.getTiddlerRelinkReferences(title,options);
		if (refs) {
			results.pushTop(Object.keys(refs));
		}
	});
	return results.toArray();
};
