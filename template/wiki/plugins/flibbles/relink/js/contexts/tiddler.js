/*\

Context for a tiddler. Defines nothing but makes an entry point to test if
a tiddler must be refreshed.

\*/

var WidgetContext = require('./widget.js').widget;

function TiddlerContext(wiki, parentContext, title) {
	this.title = title;
	this.parent = parentContext;
	var globalWidget = parentContext && parentContext.widget;
	var parentWidget = wiki.makeWidget(null, {parentWidget: globalWidget});
	parentWidget.setVariable('currentTiddler', title);
	this.widget = wiki.makeWidget(null, {parentWidget: parentWidget});
};

exports.tiddler = TiddlerContext;

TiddlerContext.prototype = new WidgetContext();

TiddlerContext.prototype.changed = function(changes) {
	return this.widget && this.widget.refresh(changes);
};

// By default, a tiddler context does not use imports, unless an import
// statement is later discovered somewhere in the fields.
TiddlerContext.prototype.hasImports = function(value) {
	return this._hasImports || (this._hasImports = value);
};
