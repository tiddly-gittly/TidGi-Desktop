# Git 移动端同步重构方案

本文档记录 TidGi-Mobile 与 TidGi-Desktop 之间基于 Git 的同步机制重构设计。此次重构将横跨工作区内的多个项目：TidGi-Desktop、TidGi-Mobile、tw-mobile-sync、TiddlyWiki5。

相关 Issue：
- https://github.com/tiddly-gittly/TidGi-Mobile/issues/88
- https://github.com/tiddly-gittly/TidGi-Mobile/issues/37

## 核心目标

1. 移动端工作区从 SQLite 存储改为 Git 仓库文件夹存储
2. 桌面端通过 mobile-sync 插件提供 Git Smart HTTP 服务，移动端可直接 pull/push
3. 移动端与桌面端共用 tidgi.config.json 配置规范，各端只解析自己理解的字段
4. 保留 skinny HTML 启动机制，移动端从仓库文件系统读取 tiddlers 并注入 WebView

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        TidGi-Desktop                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              TiddlyWiki NodeJS --listen                 │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │           tw-mobile-sync 插件                    │    │    │
│  │  │  - GET /tw-mobile-sync/get-skinny-html (无鉴权) │    │    │
│  │  │  - Git Smart HTTP 路由 (Basic Auth)             │    │    │
│  │  │    - GET  /tw-mobile-sync/git/{workspaceId}/info/refs              │    │    │
│  │  │    - POST /tw-mobile-sync/git/{workspaceId}/git-upload-pack        │    │    │
│  │  │    - POST /tw-mobile-sync/git/{workspaceId}/git-receive-pack       │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                  │
│              通过 global.service 暴露 TidGi 服务给nodejs端插件               │
│              获取 git 路径、workspace token、repoPath          │
└─────────────────────────────────────────────────────────────────┘
                               │
                          局域网 HTTP
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        TidGi-Mobile                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  扫码导入: { baseUrl, workspaceId, token }              │    │
│  │  Git clone 到本地文件夹工作区                           │    │
│  │  同步: git pull / git push (Basic Auth)                │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  WebView 启动                                           │    │
│  │  - 从缓存读取 skinny HTML (按 TidGi 版本缓存)          │    │
│  │  - 从仓库文件系统解析 .tid/.meta 文件                  │    │
│  │  - 流式注入 tiddlers 到 WebView                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  路由与保存                                             │    │
│  │  - WebView 内调用 $tw.wiki.filterTiddlers() 做路由决策 │    │
│  │  - 原生层只负责 IO (Expo FS)                           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## 各项目职责与改动范围

### TidGi-Desktop

改动文件/模块：
- src/services/wiki/wikiWorker/startNodeJSWiki.ts - 启动参数加 csrf-disable=yes
- src/services/git/interface.ts - 扩展服务接口，暴露 git 可执行路径与 repoPath 映射
- src/services/wiki/wikiWorker/services.ts - 把新接口注入 global.service

关键点：
- TiddlyWiki --listen 默认对 POST/PUT/DELETE 强制 CSRF header 校验，Git 客户端不带此头，会被 403 拒绝
- 必须在启动参数中加入 csrf-disable=yes 才能让 git push 通过
- workspace token 存在本地 config（不进 tidgi.config.json），插件通过 services API 查询

### tw-mobile-sync

改动文件/模块：
- 新增 Git Smart HTTP 路由模块（放在 src/tw-mobile-sync/server/Git/ 目录）
- types/tidgi-global.d.ts - 扩展声明，加入 git 路径与 token 查询接口

新增路由：
- GET /{workspaceId}/info/refs?service=git-upload-pack|git-receive-pack
- POST /{workspaceId}/git-upload-pack
- POST /{workspaceId}/git-receive-pack

实现要点：
1. 路由使用 body: "stream" 模式，直接把 request stream 转发给 git 子进程
2. 插件内自行解析 Authorization: Basic header，校验 token 是否匹配该 workspace
3. 校验失败返回 401 + WWW-Authenticate: Basic realm="TidGi"
4. 校验通过后 spawn git http-backend（或直接 spawn git-upload-pack/git-receive-pack）
5. 把子进程 stdout pipe 到 response

现有 skinny HTML endpoint 保持不变：
- GET /tw-mobile-sync/get-skinny-html - 无需鉴权，返回空壳 HTML

### TidGi-Mobile

改动文件/模块：
- src/store/workspace.ts - workspace 数据结构改为指向文件夹而非 SQLite
- src/services/WikiStorageService/ - 改为从文件系统读写 .tid/.meta 文件
- src/pages/WikiWebView/useTiddlyWiki.ts - 数据源从 SQLite 改为文件系统
- src/pages/Importer/ - 扫码导入改为 git clone 流程
- src/services/BackgroundSyncService/ - 同步改为 git pull/push
- 新增路由决策模块 - 移植桌面端 fs syncadaptor routingUtilities 逻辑，调用前端 $tw.wiki.filterTiddlers()

数据流变化：
- 之前：SQLite -> 流式注入 WebView
- 之后：文件系统(.tid/.meta) -> 解析 -> 流式注入 WebView

需要移植的 TiddlyWiki5 boot 子集函数（用于解析 .tid 文件）：
- loadTiddlersFromPath
- loadTiddlerFromFile
- parseFields
- parseJSONSafe
- defaultConfig

这些函数需改造为依赖注入的 FS 接口，由 Expo FS 实现。

### TiddlyWiki5

本次不需要修改 TiddlyWiki5 核心代码，只需从 boot/boot.js 中提取上述函数到移动端使用。

## 二维码与鉴权

二维码 JSON 格式：
```json
{
  "baseUrl": "http://192.168.1.100:5212",
  "workspaceId": "abc123",
  "token": "xxxxxx"
}
```

鉴权流程：
1. 移动端扫码获取 baseUrl、workspaceId、token
2. 把 token 作为该 remote 的私有字段存入本地（不进 tidgi.config.json）
3. Git 请求时组装 Authorization: Basic base64(":token") 或 base64("tidgi:token")
4. 插件侧解析 header，通过 global.service 查询该 workspace 的 token 并比对
5. 通过则继续处理 Git 请求，失败则返回 401

workspace token 存储位置：
- 桌面端：本地 config 的 workspace 部分（现有机制）
- 移动端：本地 workspace store（不 commit 到仓库）

## tidgi.config.json 配置规范

该文件存放在每个 wiki 工作区根目录，会被 Git 同步。

处理原则：
- 桌面端和移动端共用同一个文件
- 各端只解析自己理解的字段，未知字段原样保留不丢失
- 保存时只覆盖已知字段，不删除未知字段

移动端需支持的字段（第一期）：
- name - 工作区名称
- tagNames - 路由规则：按标签分配到子工作区
- includeTagTree - 是否包含标签树递归匹配
- customFilters - 自定义筛选器路由规则
- fileSystemPathFilters - 保存路径筛选器

配置更新时机：
- 配置变更不主动搬迁现有文件
- 只有当某个 tiddler 发生保存/变更时，才按新规则计算路径并落盘
- 这与桌面端行为一致

移动端不实现的桌面端功能：
- $:/config/FileSystemPaths 和 $:/config/FileSystemExtensions 作为 fallback（桌面端也很少用到）
- 文件系统监听 watch-fs（移动端无等价能力）

## 路由决策机制

路由决策在 WebView 内执行（因为需要 TiddlyWiki filter 引擎）：
1. WebView 提供 routeTiddler(title, fields) 接口
2. 内部调用 $tw.wiki.filterTiddlers() 依次匹配各 workspace 的 customFilters、tagNames 等规则
3. 返回目标 workspace/subwiki 标识与目标相对路径
4. 原生层收到结果后执行写盘/移动操作

路由规则优先级（与桌面端一致）：
1. 按 workspace order 顺序依次匹配
2. 首个命中的规则胜出
3. 未命中任何规则则保存到主工作区

需要实现和桌面端工作去设置里一样的设置界面，用于配置。

## Skinny HTML 启动机制

skinny HTML 是一个不含 tiddler store 的空壳 HTML，只包含 boot.css、boot.js 等启动必需文件。

获取与缓存：
- 通过 GET /tw-mobile-sync/get-skinny-html 从桌面端获取（无需鉴权）
- 按 TidGi 版本缓存在移动端（不放在仓库内，而是放在 cache 目录）
- 版本号作为缓存键，升级 TidGi 后自动更新

启动流程：
1. 移动端从缓存读取 skinny HTML（若无则请求桌面端）
2. 从仓库文件系统解析 .tid/.meta 文件
3. 把 tiddlers 流式注入 WebView
4. WebView 内的接收脚本完成 boot

现有模板位置：tw-mobile-sync/src/tw-mobile-sync/server/SaveTemplate/skinny-tiddlywiki5.html.tid

## Git 同步策略

移动端只做简单操作：
- fetch / pull - 拉取桌面端更新
- push - 推送本地修改

冲突处理策略：
- 移动端不做复杂合并
- 若 push 失败（冲突），推送到临时分支 client/{deviceId}/{timestamp}
- 通知桌面端/用户在桌面端处理合并
- 桌面完毕后通知移动端再次 pull 拉取合并结果，然后删除临时分支

移动端支持多个 remote：
- 现有机制已支持多 remote
- 扫码新增的 remote 按 (baseUrl, workspaceId) 去重
- 同一工作区可同时绑定多台电脑（家/公司）

## 实现步骤

### 阶段一：桌面端 Git Smart HTTP 服务

1. TidGi-Desktop: 在 startNodeJSWiki.ts 启动参数加入 csrf-disable=yes
2. TidGi-Desktop: 扩展 git service 接口，暴露 git 可执行路径与 workspace->repoPath 映射
3. TidGi-Desktop: 在 wikiWorker/services.ts 注入新接口到 global.service
4. tw-mobile-sync: 新增 Git Smart HTTP 路由模块
5. tw-mobile-sync: 实现 workspace 级 Basic Auth 校验
6. tw-mobile-sync: 实现 git-upload-pack/git-receive-pack 请求处理（stream 方式）

### 阶段二：移动端文件系统工作区

1. TidGi-Mobile: 从 TiddlyWiki5 boot.js 提取文件解析函数，适配 Expo FS
2. TidGi-Mobile: 改造 WikiStorageService 从文件系统读写 .tid/.meta
3. TidGi-Mobile: 改造 useTiddlyWiki.ts 数据源为文件系统
4. TidGi-Mobile: 实现 tidgi.config.json 解析与 UI 编辑（已知字段）

### 阶段三：移动端 Git 同步

1. TidGi-Mobile: 改造扫码导入为 git clone 流程
2. TidGi-Mobile: 改造 BackgroundSyncService 为 git pull/push
3. TidGi-Mobile: 实现 Basic Auth 鉴权注入
4. TidGi-Mobile: 实现临时分支冲突处理策略

### 阶段四：路由与保存

1. TidGi-Mobile: 移植桌面端 routingUtilities 路由规则
2. TidGi-Mobile: 在 WebView 内实现 routeTiddler 接口
3. TidGi-Mobile: 原生层按路由结果执行文件写入/移动

## 关键文件索引

### TidGi-Desktop
- src/services/wiki/wikiWorker/startNodeJSWiki.ts - wiki 服务启动
- src/services/git/interface.ts - git 服务接口定义
- src/services/git/gitOperations.ts - git 操作实现（dugite）
- src/services/wiki/wikiWorker/services.ts - 注入到插件的服务
- src/services/workspaces/tidgi.config.schema.json - 配置 schema
- src/services/workspaces/syncableConfig.ts - 可同步字段列表与默认值
- src/services/database/tidgiConfig.ts - 配置读写实现

### tw-mobile-sync
- src/tw-mobile-sync/server/TidGi-Mobile/server-get-skinny-html-endpoint.ts - skinny HTML endpoint
- src/tw-mobile-sync/server/SaveTemplate/skinny-tiddlywiki5.html.tid - HTML 模板
- src/tw-mobile-sync/types/tidgi-global.d.ts - TidGi 服务类型声明

### TidGi-Mobile
- src/store/workspace.ts - workspace 状态管理
- src/services/WikiStorageService/index.ts - wiki 存储服务
- src/pages/WikiWebView/useTiddlyWiki.ts - WebView 启动与数据注入
- src/pages/Importer/useImportHTML.ts - 导入流程
- src/services/BackgroundSyncService/index.ts - 后台同步服务
- src/constants/paths.ts - 路径常量

### TiddlyWiki5
- boot/boot.js - 需提取的文件解析函数所在位置

### 桌面端 FileSystem SyncAdaptor（移植参考）
- TidGi-Desktop/src/services/wiki/plugin/watchFileSystemAdaptor/FileSystemAdaptor.ts - 保存/删除逻辑
- TidGi-Desktop/src/services/wiki/plugin/watchFileSystemAdaptor/routingUtilities.ts - 路由规则实现
- TidGi-Desktop/src/services/wiki/plugin/watchFileSystemAdaptor/externalAttachmentUtilities.ts - 附件处理

## 风险与注意事项

1. CSRF 禁用：csrf-disable=yes 会降低安全性，但在局域网私有场景下可接受；若有公网暴露需求需额外考虑
2. Git 二进制依赖：dugite 在打包时会被裁剪，需确认保留了 git-upload-pack/git-receive-pack 相关命令
3. 大文件/二进制 tiddler：canonical_uri 机制需保留，避免仓库过大
4. 移动端 JS Git 实现：若选用 isomorphic-git 等库，需确认其 Expo FS 兼容性与性能
