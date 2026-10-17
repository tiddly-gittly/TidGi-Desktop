# services

## Service Architecture

See [ServiceDependencies.md](./ServiceDependencies.md) for detailed documentation on:

- Service dependency layers and relationships
- Startup-safe dependency rules
- When to use direct injection vs bootstrap wiring vs `LazyServiceIdentifier`
- Current injection status for all services

## Adding new Service

See [docs/internal/ServiceIPC.md](../../docs/internal/ServiceIPC.md).

## Injection Guidelines

1. **Use direct injection** for lower-layer dependencies that do not point back upward.
2. **Move cross-layer side effects into bootstrap modules** when a lower-layer service would otherwise need UI or orchestration services.
3. **Use Inversify `LazyServiceIdentifier` only for architecturally valid edges** where import-time identifier resolution is the problem.
4. **Avoid service-local `container.get()`**; keep container access in the composition root, tests, or edge helper modules only.

Before adding dependencies, check [ServiceDependencies.md](./ServiceDependencies.md) to understand the service layers and avoid creating new circular dependencies.
