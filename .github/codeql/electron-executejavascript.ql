/**
 * @name Unsafe use of webFrame.executeJavaScript with user input
 * @description Detects Electron webFrame.executeJavaScript calls with potentially tainted template strings
 * @kind path-problem
 * @problem.severity error
 * @security-severity 9.0
 * @precision high
 * @id tidgi/electron-execute-javascript-injection
 * @tags security
 *       electron
 *       external/cwe/cwe-094
 */

import javascript
import DataFlow::PathGraph

/**
 * A call to webFrame.executeJavaScript
 */
class ExecuteJavaScriptCall extends DataFlow::MethodCallNode {
  ExecuteJavaScriptCall() {
    this.getMethodName() = "executeJavaScript" and
    (
      this.getReceiver().(DataFlow::PropRead).getPropertyName() = "webFrame" or
      this.getReceiver().asExpr().(Identifier).getName() = "webFrame"
    )
  }
}

/**
 * Configuration for tracking unsafe executeJavaScript usage
 */
class ExecuteJavaScriptInjectionConfig extends TaintTracking::Configuration {
  ExecuteJavaScriptInjectionConfig() {
    this = "ExecuteJavaScriptInjectionConfig"
  }
  
  override predicate isSource(DataFlow::Node source) {
    // Function parameters
    source.asExpr() instanceof Parameter or
    // Object property access
    source instanceof DataFlow::PropRead or
    // Deep link handlers
    exists(DataFlow::CallNode call |
      (call.getCalleeName() = "on" or call.getCalleeName() = "handle") and
      call.getArgument(0).getStringValue() = ["open-url", "second-instance"] and
      source = call.getCallback(1).getParameter([0..2])
    )
  }
  
  override predicate isSink(DataFlow::Node sink) {
    exists(ExecuteJavaScriptCall exec |
      sink = exec.getArgument(0)
    )
  }
  
  override predicate isSanitizer(DataFlow::Node node) {
    // JSON.stringify sanitizes the input
    exists(DataFlow::CallNode call |
      call = DataFlow::globalVarRef("JSON").getAMemberCall("stringify") and
      node = call
    ) or
    // Explicit type checks
    exists(DataFlow::CallNode call |
      call.getCalleeName() = ["isString", "isNumber", "isBoolean"] and
      node = call
    )
  }
  
  override predicate isAdditionalTaintStep(DataFlow::Node pred, DataFlow::Node succ) {
    // Template string interpolation is a taint step
    exists(TemplateLiteral tl |
      pred.asExpr() = tl.getAnElement() and
      succ.asExpr() = tl
    )
  }
}

from ExecuteJavaScriptInjectionConfig config, DataFlow::PathNode source, DataFlow::PathNode sink
where config.hasFlowPath(source, sink)
select sink.getNode(), source, sink,
  "Potential code injection in webFrame.executeJavaScript: user input $@ flows into executed code without proper sanitization",
  source.getNode(), "here"
