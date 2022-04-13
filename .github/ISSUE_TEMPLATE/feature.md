name: Feature Request 提新功能
description: Suggest an idea for this project 提出新的功能建议
title: 'feature: '
labels: ['feature']
assignees:
  - linonetwo
body:
  - type: textarea
    id: Description
    attributes:
      label: Description 描述
      description: Describe what the behavior would be. 描述新功能应该咋样
      placeholder: Tell us what you want!
    validations:
      required: true
  - type: textarea
    id: Context
    attributes:
      label: Additional Context 额外上下文
      description: List any other information that is relevant to your issue. Stack traces, related issues, suggestions on how to add, use case, forum links, screenshots, OS if applicable, etc.
