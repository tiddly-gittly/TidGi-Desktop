/**
 * @name Template string injection in code execution
 * @description Detects user input flowing into template strings that are passed to code execution functions
 * @kind path-problem
 * @problem.severity error
 * @security-severity 9.3
 * @precision high
 * @id tidgi/template-string-injection
 * @tags security
 *       external/cwe/cwe-094
 *       external/cwe/cwe-095
 */

import javascript
import DataFlow::PathGraph

/**
 * A call to a function that executes code dynamically
 */
class CodeExecutionCall extends DataFlow::CallNode {
  CodeExecutionCall() {
    // Direct code execution
    this.getCalleeName() = ["eval", "Function"] or
    // Electron-specific code execution
    this.getCalleeName() = "executeJavaScript" or
    // VM module code execution
    this.(DataFlow::MethodCallNode).getMethodName() = ["runInContext", "runInNewContext", "runInThisContext"]
  }
}

/**
 * A template literal that contains potentially tainted elements
 */
class TaintedTemplateLiteral extends DataFlow::Node {
  TemplateLiteral literal;
  
  TaintedTemplateLiteral() {
    this.asExpr() = literal
  }
  
  TemplateLiteral getLiteral() {
    result = literal
  }
}

/**
 * Configuration for tracking tainted data flow into template literals used in code execution
 */
class TemplateStringInjectionConfig extends TaintTracking::Configuration {
  TemplateStringInjectionConfig() {
    this = "TemplateStringInjectionConfig"
  }
  
  override predicate isSource(DataFlow::Node source) {
    // Any parameter or property access could be user-controlled
    source.asExpr() instanceof Parameter or
    source instanceof DataFlow::PropRead or
    // IPC sources in Electron
    exists(DataFlow::CallNode call |
      call.getCalleeName() = ["on", "handle", "once"] and
      source = call.getCallback(0).getParameter(1)
    )
  }
  
  override predicate isSink(DataFlow::Node sink) {
    // Template literal elements that flow into code execution
    exists(CodeExecutionCall exec, TaintedTemplateLiteral tl |
      exec.getAnArgument() = tl and
      exists(Expr element |
        element = tl.getLiteral().getAnElement() and
        sink.asExpr() = element
      )
    )
  }
  
  override predicate isSanitizer(DataFlow::Node node) {
    // JSON.stringify is a safe sanitizer
    exists(DataFlow::CallNode call |
      call = DataFlow::globalVarRef("JSON").getAMemberCall("stringify") and
      node = call
    )
  }
}

from TemplateStringInjectionConfig config, DataFlow::PathNode source, DataFlow::PathNode sink,
     CodeExecutionCall exec, TaintedTemplateLiteral tl
where
  config.hasFlowPath(source, sink) and
  exec.getAnArgument() = tl and
  exists(Expr element |
    element = tl.getLiteral().getAnElement() and
    sink.getNode().asExpr() = element
  )
select exec, source, sink,
  "Potential code injection: user input $@ flows into template string passed to " + exec.getCalleeName(),
  source.getNode(), "here"
