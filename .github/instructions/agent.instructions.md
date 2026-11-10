---
applyTo: '**/*.ts|tsx|js|jsx|tid'
---

## ⛔ Git 操作禁令（最高优先级）

- **绝对禁止 `git push --force`、`git push -f`、`git push --force-with-lease`**
- **绝对禁止 `git push --no-verify`** — lint 错误必须修，不能跳过
- **绝对禁止 `git push --force` 任何变体到 shared branch**
- 如果 push 被 pre-push hook 拦截（lint/tsc 报错），必须修掉错误再 push，绝不能绕过

## 日常规则

用英文注释，不要在注释里直接描述代码做了什么，只记录未来你觉得自己可能不容易领会到的设计目的。暂时不用关心eslint的格式要求，全部编辑完成后再用`pnpm exec eslint --fix`，先不用处理格式，以免影响你的主要工作。我使用powershell，但尽量用无须审批的vscode内置功能工具，少用需要人类审批的shell，例如尽量不要通过创建新文件再用powershell覆盖原文件的方式来更新文件。没用的 props 不要保留，不要搞向前兼容，应用还未发布所以可以修改任何地方，修改时也要检查调用处。有话就直接在聊天中和我说就行，但必须做完所有可能的相关工作，不要频繁询问我方案来打扰我，你有自主权决定最好的方案并立即实施。
