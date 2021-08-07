/*\

This handles the fetching and distribution of relink settings.

\*/

var WidgetContext = require('./widget').widget;

function ImportContext(wiki, parent, filter) {
	this.parent = parent;
	this.wiki = wiki;
	var importWidget = createImportWidget(filter, this.wiki, this.parent.widget);
	this._compileList(importWidget.tiddlerList);
	// This only works if only one filter is imported
	this.widget = this.getBottom(importWidget);
	// Trickle this up, so that any containing tiddlercontext knows that this
	// tiddler does some importing, and must be checked regularly.
	parent.hasImports(true);
};

exports.import = ImportContext;

ImportContext.prototype = new WidgetContext();

ImportContext.prototype.changed = function(changes) {
	return this.widget && this.widget.refresh(changes)
};

function createImportWidget(filter, wiki, parent) {
	var widget = wiki.makeWidget( { tree: [{
		type: "importvariables",
		attributes: {
			"filter": {
				type: "string",
				value: filter
			}
		}
	}] }, { parentWidget: parent} );
	if (parent) {
		parent.children.push(widget);
	}
	widget.execute();
	widget.renderChildren();
	var importWidget = widget.children[0];
	return importWidget;
};

ImportContext.prototype._compileList = function(titleList) {
	for (var i = 0; i < titleList.length; i++) {
		var parser = this.wiki.parseTiddler(titleList[i]);
		if (parser) {
			var parseTreeNode = parser.tree[0];
			while (parseTreeNode && parseTreeNode.type === "set") {
				if (parseTreeNode.relink) {
					for (var macroName in parseTreeNode.relink) {
						var parameters = parseTreeNode.relink[macroName];
						for (paramName in parameters) {
							this.addSetting(this.wiki, macroName, paramName, parameters[paramName], titleList[i]);
						}
					}
				}
				parseTreeNode = parseTreeNode.children && parseTreeNode.children[0];
			}
		}
	}
};
