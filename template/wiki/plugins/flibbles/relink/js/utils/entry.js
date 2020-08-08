function EntryNode() {
	this.children = [];
};

module.exports = EntryNode;

/**  PURE VIRTUAL
 * EntryNode.prototype.report = function() -> ["string", ...]
 */

EntryNode.newType = function(name) {
	function NewEntry() {
		EntryNode.apply(this, arguments);
	};
	NewEntry.prototype = Object.create(EntryNode.prototype);
	NewEntry.prototype.name = name;
	return NewEntry;
};

EntryNode.prototype.eachChild = function(method) {
	if (this.children) {
		for (var i = 0; i < this.children.length; i++) {
			method(this.children[i]);
		}
	}
};

EntryNode.prototype.add = function(entry) {
	this.children.push(entry);
};

EntryNode.prototype.report = function() {
	var output = [];
	$tw.utils.each(this.children, function(child) {
		// All wikitext children should be able to report
		$tw.utils.each(child.report(), function(report) {
			output.push(report);
		});
	});
	return output;
};

function EntryCollection() {
	this.children = Object.create(null);
	this.types = Object.create(null);
};

EntryNode.newCollection = function(name) {
	function NewCollection() {
		EntryCollection.apply(this, arguments);
	};
	NewCollection.prototype = Object.create(EntryCollection.prototype);
	NewCollection.prototype.name = name;
	return NewCollection;
};

EntryCollection.prototype.eachChild = function(method) {
	for (var child in this.children) {
		method(this.children[child]);
	}
};

EntryCollection.prototype.addChild = function(child, name, type) {
	this.children[name] = child;
	this.types[name] = type;
};

EntryCollection.prototype.report = function() {
	var output = [];
	for (var name in this.children) {
		var child = this.children[name];
		var type = this.types[name];
		if (child.report) {
			var reports = child.report();
			for (var i = 0; i < reports.length; i++) {
				output.push(this.forEachChildReport(reports[i], name, type));
			}
		} else {
			output.push(this.forEachChildReport('', name, type));

		}
	}
	return output;
};

EntryCollection.prototype.hasChildren = function() {
	return Object.keys(this.children).length > 0;
};
