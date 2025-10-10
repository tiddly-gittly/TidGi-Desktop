# Service Dependencies Documentation

This document records the dependency relationships between all services to help determine the correct injection strategy.

## Service Layers

### Layer 0: Foundation Services (No dependencies on other services)

- **Database** - Core data storage
- **Context** - Application context and paths
- **Authentication** - User authentication

### Layer 1: Basic Services (Only depend on Layer 0)

- **Preference** - Depends on: Database
- **ExternalAPI** - Depends on: Preference, Database
- **AgentBrowser** - Depends on: Database

### Layer 2: Middle Services (Depend on Layers 0-1)

- **Updater** - Depends on: Context, Preference
- **AgentDefinition** - Depends on: Database, AgentBrowser (+ lazy: AgentInstance)
- **AgentInstance** - Depends on: Database, AgentDefinition

### Layer 3: High-Level Services (Complex dependencies, potential cycles)

#### Theme Service

- **Direct dependencies**: Preference
- **Lazy dependencies**: Wiki, Workspace
- **Reason**: Theme needs to react to workspace changes but shouldn't block workspace initialization

#### Native Service

- **Direct dependencies**: Window
- **Lazy dependencies**: Wiki, Workspace
- **Reason**: Native operations need workspace context but shouldn't create circular dependencies

#### Window Service

- **Lazy dependencies**: Preference, Workspace, WorkspaceView, MenuService, ThemeService, View
- **Reason**: Windows are created early in app lifecycle and many services need window references
- **⚠️ Circular**: Window ↔ View, Window ↔ WorkspaceView, Window ↔ Workspace

#### View Service

- **Direct dependencies**: Preference, Authentication, NativeService, MenuService
- **⚠️ Circular**: View ↔ Window, View ↔ Workspace, View ↔ WorkspaceView
- **Strategy**: Use constructor inject for non-circular, use container.get() for circular dependencies

#### Git Service

- **Direct dependencies**: Preference
- **Lazy dependencies**: Authentication, Wiki, Window, View, NativeService
- **⚠️ Circular**: Git ↔ Wiki, Git ↔ Sync
- **Reason**: Git operations are triggered by wiki and sync services

#### Wiki Service

- **Lazy dependencies**: Preference, Authentication, Database, Window, Git, Workspace, View, WorkspaceView, Sync
- **⚠️ Circular**: Wiki ↔ Git, Wiki ↔ Sync, Wiki ↔ Workspace, Wiki ↔ View
- **Reason**: Wiki is central service with many interactions

#### Sync Service

- **Lazy dependencies**: Authentication, Preference, Wiki, View, Git, WorkspaceView, Workspace
- **⚠️ Circular**: Sync ↔ Wiki, Sync ↔ Git
- **Reason**: Sync coordinates wiki and git operations

#### Workspace Service

- **Lazy dependencies**: Wiki, View, WorkspaceView, MenuService, Authentication
- **⚠️ Circular**: Workspace ↔ Wiki, Workspace ↔ View, Workspace ↔ WorkspaceView
- **Reason**: Workspace manages wiki instances and views

#### WorkspaceView Service

- **Lazy dependencies**: Authentication, View, Wiki, Workspace, Window, Preference, MenuService, Sync
- **⚠️ Circular**: WorkspaceView ↔ View, WorkspaceView ↔ Window, WorkspaceView ↔ Workspace
- **Reason**: WorkspaceView manages UI representations of workspaces

#### WikiGitWorkspace Service

- **Lazy dependencies**: Authentication, Wiki, Git, Context, Window, WorkspaceView, NotificationService, Sync
- **⚠️ Circular**: WikiGitWorkspace has complex relationships with Wiki, Git, and Sync
- **Reason**: Coordinates wiki, git, and workspace initialization

#### Menu Service

- **Lazy dependencies**: Authentication, Context, Git, NativeService, Preference, View, Wiki, WikiGitWorkspace, Window, Workspace, WorkspaceView, Sync (12 total!)
- **⚠️ Circular**: Menu depends on almost everything
- **Reason**: Menu needs to access all services for menu actions
- **Strategy**: All dependencies should use lazyInject or container.get() to avoid blocking other services

### Layer 4: Special Services

#### WikiEmbedding Service

- **Direct dependencies**: Database, ExternalAPI, Wiki, Workspace
- **Note**: Can use direct inject since it's called after core services are initialized

## Circular Dependency Chains

### Main Circular Chains:

1. **View ↔ Window ↔ WorkspaceView ↔ Workspace**
2. **Wiki ↔ Git ↔ Sync**
3. **Wiki ↔ Workspace ↔ View**

## Injection Strategy

### ✅ Use Constructor Injection When:

- Service is in Layer 0-2 (foundation/basic/middle services)
- No circular dependency exists
- Dependency is required for service initialization

### ⚠️ Use Lazy Injection When:

- Service is in Layer 3-4 with potential circular dependencies
- Dependency is not needed during construction
- Service participates in circular dependency chains

### 🔄 Use container.get() When:

- Inside a method that needs a service with circular dependency
- Only in tests or special initialization scenarios
- When lazyInject would cause initialization order issues

## Current Status (After Webpack → Vite Migration)

### Services Using Constructor Injection:

- View: Preference, Authentication, NativeService, MenuService ✅
- Git: Preference ✅
- Theme: Preference ✅
- Native: Window ✅
- Updater: Context, Preference ✅
- WikiEmbedding: Database, ExternalAPI, Wiki, Workspace ✅
- ExternalAPI: Preference, Database ✅
- AgentInstance: Database, AgentDefinition ✅
- AgentBrowser: Database ✅
- AgentDefinition: Database, AgentBrowser ✅

### Services Still Using LazyInject (Need Review):

- Git: Authentication, Wiki, Window, View, NativeService (5)
- Wiki: All 9 dependencies
- Sync: All 7 dependencies
- Menu: All 12 dependencies
- Window: All 6 dependencies
- Workspace: All 5 dependencies
- WorkspaceView: All 9 dependencies
- WikiGitWorkspace: All 8 dependencies
- Theme: Wiki, Workspace (2)
- Native: Wiki, Workspace (2)
- AgentDefinition: AgentInstance (1) - legitimate lazy for circular dependency

**Total LazyInject count: ~70**

## Recommended Actions

### Priority 1: Remove Unnecessary LazyInject

Services that can safely use constructor injection but currently use lazyInject:

1. **Git Service**:
   - Can inject: Authentication (Layer 0)
   - Keep lazy: Wiki, Window, View, NativeService (circular dependencies)

2. **Theme Service**:
   - Already injects: Preference ✅
   - Keep lazy: Wiki, Workspace (used conditionally)

3. **Native Service**:
   - Already injects: Window ✅
   - Keep lazy: Wiki, Workspace (used conditionally)

### Priority 2: Document Remaining LazyInject

All remaining lazyInject should be documented with reasons in code comments.

### Priority 3: Future Refactoring

Consider extracting menu building logic to reduce Menu service's dependencies.
