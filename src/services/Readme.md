# services

## Service Architecture

See [ServiceDependencies.md](./ServiceDependencies.md) for detailed documentation on:

- Service dependency layers and relationships
- Circular dependency chains
- When to use constructor injection vs lazy injection vs container.get()
- Current injection status for all services

## Adding new Service

See [docs/internal/ServiceIPC.md](../../docs/internal/ServiceIPC.md).

## Injection Guidelines

1. **Use constructor injection** for services in Layer 0-2 (foundation/basic/middle services)
2. **Use lazy injection** for services in Layer 3-4 with circular dependencies
3. **Use container.get()** only inside methods when absolutely necessary for circular dependencies
4. Always document the reason when using lazy injection or container.get()

Before adding dependencies, check [ServiceDependencies.md](./ServiceDependencies.md) to understand the service layers and avoid creating new circular dependencies.
