---
applyTo: '**/*.ts|tsx|js|jsx|tid'
---
用英文注释，不用关心eslint的格式要求，全部编辑完成后再用pnpm exec eslint --fix，先不用处理格式，以免影响你的主要工作。我使用powershell，但尽量用无须审批的vscode内置功能工具，少用需要人类审批的shell，例如尽量不要通过创建新文件再用powershell覆盖原文件的方式来更新文件。没用的 props 不要保留，不要搞向前兼容，修改时也要检查调用处。还有去掉代码中没用的注释，有话就直接在聊天中和我说就行。