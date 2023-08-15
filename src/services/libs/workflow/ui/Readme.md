# UI Effects

## How it works

See [noflo/noflo/issues How to inject context dependency into all components? #1043](https://github.com/noflo/noflo/issues/1043) for technical discussions.

UI effects are noflo components that calls UI-related method injected by the environment, cause environment (Tiddlywiki/Dev Playground) to show up an Input/Buttons/Dropdown when necessary.

The UI widget will block the graph's execution on the UI-related node, by not sending packet to next nodes. Until user write down or pickup something in the UI, and click the "Submit" button or something that confirms the UI interaction. So UI widget is a way to automatically generate forms to collect user's opinion that will be needed in graph execution, for example, the prompt for ChatGPT.

In this way, the end-user won't need to access the noflo graph, he just need to start the graph (workflow), and wait for UI widgets to show up, then input necessary information, confirms, then wait for result show in another UI widget.

UI effect noflo components should use the same code to work in different environment, let the injected method to do the platform specific jobs. Methods will be injected from the `ui_effects` inPort.

## This folder

Here are some example/basic noflo components to show how to use those injected methods, not necessary meets all workflow developer's need.

Workflow developers can take these components as example, to write new components using JS, and package the new components as plugin that should be installed before using their workflows.
