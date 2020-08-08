/*\
title: $:/plugins/tobibeer/appear/widget.js
type: application/javascript
module-type: widget

Use the appear widget for popups, sliders, accordion menus

@preserve
\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget,
	AppearWidget = function(parseTreeNode,options) {
		this.initialise(parseTreeNode,options);
	},
	handlerCache = {};

/*
Inherit from the base widget class
*/
AppearWidget.prototype = new Widget();

/*
Render this widget into the DOM
*/
AppearWidget.prototype.render = function(parent,nextSibling) {
	this.parentDomNode = parent;
	this.nextSibling = nextSibling;
	this.computeAttributes();
	this.execute();
	var cls,button,buttonClose,hidden,reveal,shown,
		// Will hold the child widgets
		nodes = [];
	// Handler instance?
	if(this.handle) {
		// Recreate cache
		this.getHandlerCache(this.handle,1);
		// Handle refreshes
		this.refreshHandler();
	// Regular instance
	} else {
		// Create button
		button = {type:"button"};
		// Init button attributes
		button.attributes = this.setAttributes(button,"button");
		// Store current classes
		cls = button.attributes["class"].value.trim();
		// Add unselected class
		button.attributes["class"].value = cls + " appear-show" + (this.handler ? " tc-popup-absolute" : "");
		// Parse label and add to children
		button.children = this.wiki.parseText(
			"text/vnd.tiddlywiki",
			this.show,
			{parseAsInline: true}
		).tree;
		// Create reveal
		reveal = {type:"reveal",children:this.parseTreeNode.children};
		// Init reveal attributes
		reveal.attributes = this.setAttributes(reveal,"reveal");
		// Set custom mode, if configured
		reveal.isBlock = !(this.mode && this.mode === "inline");
		// Type popup?
		if(reveal.attributes.type && reveal.attributes.type.value === "popup") {
			// Set button attribute for popup state
			button.attributes.popup = reveal.attributes.state;
			// Add childnodes
			nodes.push(button);
			// Unless we have a deferred handler defined
			if(!this.handler) {
				// Push reveal to node tree
				nodes.push(reveal);
			} else {
				button.attributes.handler = this.handler;
			}
		// Not a popup
		} else {
			// Set reveal attribute for "slider mode"
			reveal.attributes.type = {type: "string", value: "match"};
			// Must match current tiddler title
			reveal.attributes.text = {type: "string", value: this.currentTiddler};
			// Button writes to state tiddler
			button.attributes.set =  reveal.attributes.state;
			// Sets to current tiddler
			button.attributes.setTo =  {type: "string", value: this.currentTiddler};
			// A wrapper reveal that will be hidden once the content is shown containing the button
			hidden = {type:"reveal",isBlock: this.block, children:[button], attributes: {
				type: {type: "string", value: "nomatch"},
				state: reveal.attributes.state,
				text: {type: "string", value: this.currentTiddler}
			}};
			// Endless toggling?
			if(!this.once) {
				// Create hide-button as a copy of the button
				buttonClose = $tw.utils.deepCopy(button);
				// Add selected class
				buttonClose.attributes["class"].value = cls + " appear-hide " +
					(this.attr.button.selectedClass ? this.attr.button.selectedClass : "");
				// However, resetting the state
				buttonClose.attributes.setTo = {type: "string", value: ""};
				// Setting the hide-button label
				buttonClose.children = this.wiki.parseText(
					"text/vnd.tiddlywiki",
					this.hide,
					{parseAsInline: true}
				).tree;
			}
			// Create a copy of the first reveal containing the button
			shown = $tw.utils.deepCopy(hidden);
			// Reset its children
			shown.children = [];
			// Endless toggling?
			if(!this.once) {
				// Add close button
				shown.children.push(buttonClose);
			}
			// No remote handler?
			if(!this.handler) {
				// Add slider contents
				shown.children.push(reveal);
			}
			// Switch reveal type for content reveal wrapper
			shown.attributes.type.value = "match";
			// Add wrapping reveals to output
			nodes.push(hidden,shown);
		}
		// Construct the child widgets
		this.makeChildWidgets(nodes);
		// Render into the dom
		this.renderChildren(this.parentDomNode,nextSibling);
		// Now, do we have a remote handler?
		if(this.handler) {
			// Update its state
			this.addToHandlerCache(reveal);
		}
	}
};

/*
Compute the internal state of the widget
*/
AppearWidget.prototype.execute = function() {
	var self = this;
	// Attribute mapping
	this.attr = {
		// Which attributes map to which element
		map: {
			reveal: {
				"class":1,
				position:1,
				retain:1,
				state:1,
				style:1,
				tag:1,
				type:1
			},
			button: {
				"button-class":1,
				"button-style":1,
				"button-tag":1,
				tooltip:1,
				selectedClass:1
			}
		},
		// Rename duplicate attributes later
		rename: {
			"button-class":"class",
			"button-style":"style",
			"button-tag":"tag"
		},
		// Initialize empty containers
		button: {},
		reveal: {}
	};
	// Loop widget attributes
	$tw.utils.each(this.attributes,function(val,key) {
		var next;
		// Loop mappings
		$tw.utils.each(
			self.attr.map,function(attr,el) {
			// Loop attributes for element
			$tw.utils.each(Object.keys(attr),function(attr) {
				// Attribute for element?
				if(attr == key) {
					// Store attr value
					self.attr[el][key] = val;
					// Next attribute
					next = false;
					return false;
				}
			});
			return next;
		});
	});
	// Handle all other attributes...
	// Store current tiddler
	this.currentTiddler = this.getVariable("currentTiddler");
	// Default button label
	this.show = this.getValue(this.attributes.show,"show");
	// Label for hide-button
	this.hide = this.getValue(this.attributes.hide,"hide");
	// None defined?
	if(!this.hide) {
		// Use default label
		this.hide = this.show;
	}
	// Whether to only reveal the content once
	this.once = this.attributes.once && this.attributes.once !== "false";
	// State shorthand
	this.$state = this.attributes.$state;
	// Reveal mode
	this.mode = this.getValue(this.attributes.mode,"mode");
	// Is this a handler instance?
	this.handle = this.attributes.handle;
	// Remotely handle this instance?
	this.handler = this.attributes.handler;
	// For that case we take these variables along
	this.handlerVariables = (this.attributes.variables || "") + " currentTiddler";
	// Whether or not to keep popups
	this.keep = ["yes","true"].indexOf(
			(this.getValue(this.attributes.keep,"keep")||"").toLocaleLowerCase()
		) >- 1;
	// No explicit state?
	if(!this.attr.reveal.state) {
		// Calculate fallback state
		this.attr.reveal.state =
				this.getValue(undefined,"default-state") +
				this.currentTiddler +
				this.getStateQualifier() + "/" +
				(this.attr.reveal.type ? this.attr.reveal.type + "/" : "") +
				(this.mode ? this.mode + "/" : "") +
				(this.once ? "once/" : "") +
				// Append state suffix, if given
				(this.$state ? "/" + this.$state : "");
	}
};

/*
Selectively refreshes the widget if needed. Returns true if the widget or any of its children needed re-rendering
*/
AppearWidget.prototype.refresh = function(changedTiddlers) {
	var changedAttributes = this.computeAttributes();
	// Any changed attributes?
	if(Object.keys(changedAttributes).length) {
		// Refresh
		this.refreshSelf();
		return true;
	}
	// Global handler?
	if(this.handle) {
		// Handle refreshes
		this.refreshHandler();
	}
	// Check if we're refreshing children
	return this.refreshChildren(changedTiddlers);
};

/*
Retrieves a widget parameter as either attribute, config-tiddler default or hard-coded fallback.
*/
AppearWidget.prototype.getValue = function(value,attr){
	var def,undef,
		// Global fallbacks
		fallbacks = {
			show: "»",
			"default-state": "$:/temp/appear/"
		};
	// If there is no value...
	if(value === undefined) {
		// Get default for it
		def = this.wiki.getTiddler("$:/plugins/tobibeer/appear/defaults/" + attr);
		// Got one?
		if(def) {
			// Check if set to undefined
			undef = def.getFieldString("undefined");
			// Not undefined?
			if(!undef || undef === "false") {
				// Read default
				value = def.getFieldString("text");
			}
		}
	}
	// If we still have no value
	if(value === undefined) {
		// Try to read from fallbacks
		value = fallbacks[attr];
	}
	return value;
};

/*
Set child-widget attributes for a given element,
depending on the parsed widget attributes
*/
AppearWidget.prototype.setAttributes = function(node,element) {
	var self = this,
		// Initialize attributes object
		result = {};
	// Loop attributes defined for this element
	$tw.utils.each(Object.keys(this.attr.map[element]),function(attr) {
		var val,
			// Check if we needed to rename this attribute
			name = self.attr.rename[attr];
		// Not renamed?
		if(!name) {
			// Take attribute name as is
			name = attr;
		}
		// Read as widget value, default, or fallback
		val = self.getValue(self.attr[element][attr],attr);
		// Class attribute? (always for the button, for the reveal only if undefined)
		if(name === "class") {
			// Construct classes
			val = [
				"appear",
				"appear-" + element,
				(element === "reveal" && self.keep ? "tc-popup-keep" : ""),
				(self.mode ? "appear-" + self.mode : ""),
				(self.once ? "appear-once" : ""),
				(val || "")
			].join(" ");
		}
		// Do we have a value?
		if(val !== undefined) {
			// Set an element tag?
			if(name === "tag") {
				// Then set it for the parseTreeNode directly
				node.tag = val;
			// Set an attribute?
			} else {
				// Add to attribute object
				result[name] = {type: "string", value: val};
			}
		}
	});
	// Return all attributes as an object
	return result;
};

/*
Retrieves handler cache, creates if not existing or told to
*/
AppearWidget.prototype.getHandlerCache = function(handler,create) {
	// Retrieve cache for handler
	var cache = handlerCache[handler];
	// If not existing or asked to be created
	if(!cache || create){
		// Create new cache for handler
		handlerCache[handler] = {
			// For these states
			handled: {},
			// Refresh list
			handle: {}
		};
		cache = handlerCache[handler];
	}
	return cache;
};

/*
Retrieve notifier list for global handler and create contents accordingly
*/
AppearWidget.prototype.refreshHandler = function() {
	var self = this,
		// Get cache for handler
		cache = this.getHandlerCache(this.handle),
		// Load refresh items from global cache for handler
		handle = cache.handle;
	// Got anything to handle?
	if(Object.keys(handle).length) {
		// Loop refresh handles
		$tw.utils.each(handle, function(node,state) {
			// Remove existing child node
			self.removeChildNode(state);
			// Render as child node
			self.children.push(self.makeChildWidget(node));
			// Rrnder child
			self.children[self.children.length - 1].render(self.parentDomNode,self.nextSibling);
		});
		// Remove entries
		handlerCache[this.handle].handle = {};
	}
};

/*
Removes a child node of a handler for a given state
*/
AppearWidget.prototype.removeChildNode = function(state) {
	var self = this;
	// Loop all child widgets of handler
	$tw.utils.each(this.children, function(node,index) {
		// Same state?
		if(node.children[0].state === state) {
			// Remove any domNodes
			node.removeChildDomNodes();
			// Delete child widget
			self.children.splice(index);
			// Done
			return false;
		}
	});
};

/*
Checks and updates the state for a reveal widget handling remote content
*/
AppearWidget.prototype.addToHandlerCache = function(reveal) {
	var self = this,
		// Only one per state
		state = reveal.attributes.state.value,
		// Retrieve cache for handler
		cache = this.getHandlerCache(this.handler),
		// Retrieve parseTree for state as cached for the handler
		cached = cache.handled[state],
		// Create vars widget wrapper containing the reveal
		vars = {type:"vars", children:[reveal], attributes:{}};
	// Loop
	$tw.utils.each(
		// Handler variables
		(this.handlerVariables || "").split(" "),
		function(v) {
			// No empty strings
			v = v.trim();
			if(v){
				// Store variable as vars widget attribute by...
				vars.attributes[v] = {
					type: "string",
					// Fetching the current variable value
					value: (self.getVariable(v) || "").toString()};
			}
		}
	);
	// If the state for this reveal is not the cached one
	if(vars !== cached) {
		// Add to refresh list, picked up by handler
		cache.handle[state] = vars;
		// Trigger refresh by writing to dummy temp tiddler for handler
		this.wiki.setText("$:/temp/appear-handler/"+this.handler,"text",undefined,state);
	}
};

// Now we got a widget ready for use
exports.appear = AppearWidget;

})();