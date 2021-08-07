/*\

Entries are deprecated. Don't use them. These classes are here just so that
any 3rd party modules built for Relink V1 don't break.

Just return an object like, {output: "string", impossible: true|undefined}

\*/

function EntryNode() {
	this.children = [];
};

module.exports = EntryNode;

/**  PURE VIRTUAL
 * EntryNode.prototype.report = function() -> ["string", ...]
 */

EntryNode.newType = function() {
	return EntryNode;
};

EntryNode.prototype.add = function(entry) {
	this.children.push(entry);
};

function EntryCollection() {
	this.children = Object.create(null);
	this.types = Object.create(null);
};

EntryNode.newCollection = function(name) {
	return EntryCollection;
};

// Again. I reiterate. Don't use this. All this is just legacy support.
Object.defineProperty(EntryCollection, 'impossible', {
	get: function() {
		var imp = this._impossible;
		this.eachChild(function(child) { imp = imp || child.impossible; });
		return imp;
	},
	set: function(impossible) {
		this._impossible = true;
	}
});

EntryCollection.prototype.eachChild = function(method) {
	for (var child in this.children) {
		method(this.children[child]);
	}
};

EntryCollection.prototype.addChild = function(child, name, type) {
	this.children[name] = child;
	this.types[name] = type;
};

EntryCollection.prototype.hasChildren = function() {
	return Object.keys(this.children).length > 0;
};
