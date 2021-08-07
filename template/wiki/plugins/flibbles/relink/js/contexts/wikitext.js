/*\

Context for wikitext. It can contain rules about what's allowed in this
current layer of wikitext.

\*/

var WidgetContext = require('./widget.js').widget;

function WikitextContext(parentContext) {
	this.parent = parentContext;
	this.widget = parentContext.widget;
};

exports.wikitext = WikitextContext;

WikitextContext.prototype = new WidgetContext();

// Unless this specific context has rules about it, widgets and prettyLInks are allowed.
WikitextContext.prototype.allowWidgets = enabled;
WikitextContext.prototype.allowPrettylinks = enabled;

function enabled() { return true; };
