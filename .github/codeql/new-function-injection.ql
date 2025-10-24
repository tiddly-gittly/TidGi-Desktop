/**
 * @name Unsafe use of Function constructor with user input
 * @description Detects Function constructor calls with potentially tainted template strings
 * @kind path-problem
 * @problem.severity error
 * @security-severity 9.0
 * @precision high
 * @id tidgi/new-function-injection
 * @tags security
 *       external/cwe/cwe-094
 */

import javascript
import DataFlow::PathGraph

/**
 * A call to the Function constructor
 */
class FunctionConstructorCall extends DataFlow::NewNode {
  FunctionConstructorCall() {
    this.getCalleeName() = "Function"
  }
}

/**
 * Configuration for tracking unsafe Function constructor usage
 */
class FunctionConstructorInjectionConfig extends TaintTracking::Configuration {
  FunctionConstructorInjectionConfig() {
    this = "FunctionConstructorInjectionConfig"
  }
  
  override predicate isSource(DataFlow::Node source) {
    // Function parameters
    source.asExpr() instanceof Parameter or
    // Object property access
    source instanceof DataFlow::PropRead or
    // IPC message handlers
    exists(DataFlow::CallNode call |
      (call.getCalleeName() = "on" or call.getCalleeName() = "handle") and
      source = call.getCallback([0..1]).getParameter([0..2])
    )
  }
  
  override predicate isSink(DataFlow::Node sink) {
    exists(FunctionConstructorCall fnCall |
      sink = fnCall.getAnArgument()
    )
  }
  
  override predicate isSanitizer(DataFlow::Node node) {
    // JSON.parse/stringify are safe
    exists(DataFlow::CallNode call |
      call = DataFlow::globalVarRef("JSON").getAMemberCall(["stringify", "parse"]) and
      node = call
    ) or
    // Whitelist validation
    exists(DataFlow::MethodCallNode test |
      test.getMethodName() = "test" and
      test.getReceiver().asExpr() instanceof RegExpLiteral and
      node = test
    )
  }
  
  override predicate isAdditionalTaintStep(DataFlow::Node pred, DataFlow::Node succ) {
    // Template string interpolation
    exists(TemplateLiteral tl |
      pred.asExpr() = tl.getAnElement() and
      succ.asExpr() = tl
    ) or
    // String concatenation
    exists(AddExpr add |
      pred.asExpr() = add.getAnOperand() and
      succ.asExpr() = add
    )
  }
}

from FunctionConstructorInjectionConfig config, DataFlow::PathNode source, DataFlow::PathNode sink
where config.hasFlowPath(source, sink)
select sink.getNode(), source, sink,
  "Potential code injection via Function constructor: user input $@ flows into dynamically created function",
  source.getNode(), "here"
