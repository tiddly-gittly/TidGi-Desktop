# PR #717 修复任务交接文档

## PR 状态

- **PR**: https://github.com/tiddly-gittly/TidGi-Desktop/pull/717
- **分支**: `fix/misc-batch-2026-06` → `master`
- **单元测试**: ✅ 全部通过
- **CodeQL**: ✅ 通过
- **E2E 测试**: 5/7 shard 通过，2/7 失败

## 已完成的修复（可保留）

### 1. FileSystemWatcher 类型混淆 bug（核心修复，Closes #669）
**文件**: `src/services/wiki/plugin/watchFileSystemAdaptor/FileSystemWatcher.ts`

**根因**: `loadTiddler()` 将 tiddler 的内容类型（如 `text/markdown`）误用为文件格式类型写入 `boot.files[title].type`。TiddlyWiki 的 `saveTiddlerToFile()` 只在 `fileInfo.type === "application/x-tiddler"` 时保存为 .tid 格式，其他值都走 JSON 分支。

**修复**:
- `IFileChange` 接口新增 `cachedFileDescriptor` 字段，存储文件级元数据
- `handleFileAddOrChange()` 缓存 `fileDescriptor` 到 `pendingFileLoads`
- `loadTiddler()` 使用 `cachedFileDescriptor.type`（文件格式类型）而非 `tiddler.type`（内容类型）
- 新增 `inferFileTypeFromExtension()` 作为兜底
- 新增 .tid→.json 格式变更检测告警
- 内容比较时标准化换行符

### 2. Copilot PR Review 反馈
- 注释修正：从"验证"改为准确描述"使用文件格式类型 + 回退"
- 测试重写：实例化真实 `FileSystemWatcher`，注入 `pendingFileLoads`，调用 `loadTiddler()` 验证

### 3. GitLog 不必要的类型断言
**文件**: `src/windows/GitLog/index.tsx`, `GitLogSyncSettings.tsx`, `useGitLogData.ts`
- 移除 `as unknown as IWikiWorkspace`，`workspaceInfo` 已经是 `any` 类型
- 修复导入排序

### 4. contextMenu 复制图片
**文件**: `src/services/menu/contextMenu/contextMenuBuilder.ts`
- 使用 `copyImage()` i18n 字符串替代 `copy()`
- 添加 `response.ok` 和 `image.isEmpty()` 校验

### 5. 动态 import 改静态 import
**文件**: `src/services/analytics/index.ts`, `src/main.ts` 等
- 修复 Electron 41 (Node.js 22) 下 `import()` 路径别名崩溃

### 6. 子工作区休眠状态同步
**文件**: `src/services/workspacesView/index.ts`

### 7. 单元测试
**文件**: `src/services/wiki/plugin/watchFileSystemAdaptor/__tests__/FileSystemWatcher.loadTiddler.test.ts`（7 个测试，全部通过）

---

## 未解决的问题：E2E 测试失败

### 失败场景
`features/subWiki.feature` → **"Create sub-wiki workspace via UI"**

### 失败现象
```
Then I wait for log markers:
  | main wiki restarted after sub-wiki creation | [test-id-MAIN_WIKI_RESTARTED_AFTER_SUBWIKI] |
  | watch-fs stabilized after restart           | [test-id-WATCH_FS_STABILIZED] |
  | SSE ready after restart                     | [test-id-SSE_READY] |
  | view loaded                                 | [test-id-VIEW_LOADED] |

Error: function timed out, ensure the promise resolves within 20998 milliseconds
```

### 根因分析

**不是超时配置问题，是主 wiki 重启太慢。**

创建子 wiki 时，[`wikiStartup()`](src/services/wiki/index.ts:877) 调用 [`restartWorkspaceViewService(mainWikiID)`](src/services/workspacesView/index.ts:584) 重启主 wiki。重启流程：

1. **[`stopWiki()`](src/services/wiki/index.ts:535)** — 停止 worker
   - `worker.beforeExit()` 清理 nsfw watcher — nsfw.stop() 可能死锁，**硬编码 5 秒超时**
   - `terminateWorker()` — **硬编码 3 秒超时**
   - 光 stop 阶段最多 8 秒
2. **[`initializeWorkspaceView()`](src/services/workspacesView/index.ts:82)** — 重新启动
   - `startWiki()` 创建新 worker、加载 TiddlyWiki、初始化 nsfw watcher、启动 HTTP server
   - `addViewForAllBrowserViews()` 创建 BrowserView
3. **`reloadViewsWebContents()`** — 重载页面
4. 然后才发射 `[test-id-MAIN_WIKI_RESTARTED_AFTER_SUBWIKI]`

校准出的 `stepMs ≈ 21 秒`，但 CI 上重启偶尔超过 21 秒。

### 为什么不能用 `@calibrate` 标签

已尝试添加 `@calibrate` 到该场景。结果：校准的 `waitMs` 从 ~5 秒膨胀到 ~300 秒（因为子 wiki 创建的重启等待被归类为 wait 类型），**污染了所有普通等待步骤的超时**，导致整个 E2E 套件每个 wait 步骤都要等 5 分钟。

### 文档约束

[`scripts/end-to-end-preflight.ts`](scripts/end-to-end-preflight.ts:137) 明确写了：

> Don't use hardcoded timeout or multiplier to hide the underlying problem, it will only waste more time. Only look at log and code to understand the true problem. Don't be lazy.

[`features/supports/calibration.ts`](features/supports/calibration.ts:6) 也写了：

> Preflight runs smoke test 4×, extracts per-step durations from cucumber JSON, classifies by operation type. Timeouts are set to the measured worst case for each type. **No hardcoded timeout values anywhere.**

### 建议的修复方向

**方向 1: 不重启 worker，只重新加载 tiddler**

创建子 wiki 后，主 wiki 需要感知新子 wiki 的 tiddler。当前做法是 stop+restart 整个 worker。可以改为：
- 将子 wiki 的路径加入主 wiki worker 的 tiddler 搜索路径
- 调用 `$tw.loadTiddlersFromFolder()` 或类似 API 重新扫描
- 不需要 stop nsfw、terminate worker、重新启动 HTTP server

**方向 2: 优化 stopWiki 的 nsfw 清理**

[`FileSystemWatcher.cleanup()`](src/services/wiki/plugin/watchFileSystemAdaptor/FileSystemWatcher.ts:389) 中 `await this.watcher.stop()` 可能死锁。可以：
- 不 await stop，直接置 null，让 OS 回收句柄
- 或者用 `AbortController` 模式实现可取消的 stop

**方向 3: 让校准系统支持"重型"场景的单独超时类别**

当前校准只分 4 类：`stepMs`, `launchMs`, `waitMs`, `elementMs`。子 wiki 重启涉及的是 "restart" 级别的操作，应该有独立的超时类别，不污染普通的 wait 超时。

**方向 4: 在测试步骤中区分"等待重启标记"和"等待普通标记"**

当前 `Then I wait for log markers:` 步骤对所有标记使用同一个 `CUCUMBER_GLOBAL_TIMEOUT`。可以为重启场景使用 `HEAVY_LOG_MARKER_WAIT_TIMEOUT`（虽然目前它等于 `CUCUMBER_GLOBAL_TIMEOUT`，但可以独立计算）。

---

## 关键文件清单

| 文件 | 作用 |
|------|------|
| `src/services/wiki/index.ts:535` | `stopWiki()` — 硬编码 5s+3s 超时 |
| `src/services/wiki/index.ts:877` | `wikiStartup()` — 子 wiki 创建后调用重启 |
| `src/services/workspacesView/index.ts:584` | `restartWorkspaceViewService()` — 重启流程 |
| `src/services/workspacesView/index.ts:82` | `initializeWorkspaceView()` — 启动流程 |
| `src/services/wiki/plugin/watchFileSystemAdaptor/FileSystemWatcher.ts` | 文件监听器 |
| `src/services/wiki/wikiWorker/index.ts:108` | `beforeExit()` — worker 清理 |
| `features/stepDefinitions/wiki.ts:653` | `waitForLogMarkers` 步骤定义 |
| `features/supports/calibration.ts` | 校准系统 |
| `scripts/end-to-end-preflight.ts` | 校准预检脚本 |
| `features/subWiki.feature:188` | 失败的 E2E 场景 |

## 本地复现命令

```bash
# 打包
pnpm run build:plugin
cross-env NODE_ENV=test npx electron-forge package

# 跑校准
cross-env NODE_ENV=test npx tsx scripts/end-to-end-preflight.ts

# 单独跑失败场景
cross-env NODE_ENV=test npx cucumber-js --config features/cucumber.config.js --exit --name "Create sub-wiki workspace via UI" features/subWiki.feature
```
