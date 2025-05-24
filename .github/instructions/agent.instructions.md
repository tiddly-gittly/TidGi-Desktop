---
applyTo: '**/*.ts|tsx'
---
用英文注释，不用关心eslint的格式要求，全部编辑完成后再用pnpm exec eslint --fix。我使用powershell，但尽量用无须审批的vscode内置功能工具，少用需要人类审批的shell，例如尽量不要通过创建新文件再用powershell覆盖原文件的方式来更新文件。