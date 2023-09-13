# Network manage

Manage runtime network of noflo, generated from workflow graph.

The runtime in NoFlo refers to the environment in which NoFlo is operating. For noflo-nodejs, this environment is Node.js, and for TidGi, this runtime is the renderer process of electron. Within a runtime, you can have multiple NoFlo networks, and each network can be running a different graph or even the same graph with different input data.

If you want to run multiple graphs concurrently, you can instantiate and start multiple networks. Each graph would have its own state, data flow, and lifecycle. They'll all share the same event loop due to Node.js's single-threaded nature, but they can operate concurrently because of the non-blocking I/O model.

In this folder, there is a singleton class to manage multiple NoFlo networks. The class is structured to allow adding networks, starting/stopping them, and serializing/deserializing their states. I'll provide a basic React hook example to use this manager as well.
