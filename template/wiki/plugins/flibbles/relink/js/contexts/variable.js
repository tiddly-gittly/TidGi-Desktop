/*\

This handles the context for variables. Either from $set, $vars, or \define

\*/

var WidgetContext = require('./widget').widget;

function VariableContext(parent, setParseTreeNode) {
	this.parent = parent;
	// Now create a new widget and attach it.
	var attachPoint = parent.widget;
	var setWidget = attachPoint.makeChildWidget(setParseTreeNode);
	attachPoint.children.push(setWidget);
	setWidget.computeAttributes();
	setWidget.execute();
	// point our widget to bottom, where any other contexts would attach to
	this.widget = this.getBottom(setWidget);
};

exports.variable = VariableContext;

VariableContext.prototype = new WidgetContext();
