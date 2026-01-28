
## 2026-01-23 | 日历与搜索体验优化

**When**: 2026-01-23 17:55
**Where**: 
- frontend/store/useLanguageStore.ts
- frontend/components/MonthPicker.tsx
- frontend/components/CalendarSearch.tsx
- frontend/app/(tabs)/calendar.tsx

**Why**: 响应用户反馈 (日历标题、手势操作、搜索修复、汉化)。

**What**:
1. **日历 (Calendar)**:
   - 标题 "日历视图" 改为 "日历"。
   - 支持左右滑动切换日期 (上一天/下一天)。
2. **月视图 (MonthPicker)**:
   - 支持左右滑动切换月份 (上个月/下个月)。
3. **搜索 (Search)**:
   - 修复 "最近搜索" 点击无反应的问题。
   - "AI 建议" 内容完全汉化。

## 2026-01-23 | 日历视图修复与动画优化

**When**: 2026-01-23 18:00
**Where**: 
- frontend/components/MonthPicker.tsx
- frontend/app/(tabs)/calendar.tsx

**Why**: 用户反馈日历视图显示异常及滑动无动画。

**What**:
1. **Fix Layout**: 移除 `MonthPicker` 触摸容器的 `flex: 1` 样式，解决自动高度下的显示崩溃问题。
2. **Add Animation**: 在日期和月份切换时增加 `LayoutAnimation` 布局动画，使视图过渡更连贯顺滑。
3. **Android Support**: 启用 Android 平台的 LayoutAnimation 实验性支持。

## 2026-01-23 | 日历横向整页滑动重构

**When**: 2026-01-23 18:05
**Where**: 
- frontend/app/(tabs)/calendar.tsx
- frontend/components/DayTaskView.tsx
- frontend/store/useTaskStore.ts

**Why**: 用户希望日期切换时有“整个界面横向一体”的滑动感 (Pager effect)。

**What**:
1. **Refactor**: 将时间轴内容抽取为独立组件 `DayTaskView`。
2. **Infinite Paging**: 使用 `ScrollView (pagingEnabled)` 实现无限日历翻页逻辑。
   - 渲染 前一天/今天/后一天 三个视图。
   - 滑动停止后动态更新中心日期，并重置滚动位置，实现无缝连续翻页体验。
3. **Types**: 修正 `TaskItem` / `Task` 类型引用问题。

## 2026-01-23 | 日历滑动闪烁问题修复

**When**: 2026-01-23 18:10
**Where**: frontend/app/(tabs)/calendar.tsx

**Why**: 用户反馈滑动切换日期时，界面会出现闪烁（事件先消失再出现或界面跳变）。

**What**:
1. **Conditional Animation**: 
   - 修改 `handleDateSelect`，增加 `skipAnimation` 参数。
   - 在滑动翻页 (`handleScrollEnd`) 时禁用 `LayoutAnimation`，防止布局动画与 ScrollView 的瞬时重置逻辑冲突。
   - 保持点击 WeekStrip/MonthPicker 时的过渡动画。

## 2026-01-23 | 日历快速滑动体验优化

**When**: 2026-01-23 18:15
**Where**: frontend/app/(tabs)/calendar.tsx

**Why**: 用户反馈快速滑动日历时会出现“反弹/滑不动”现象 (Rubber-banding at page limits because of async reset delay).

**What**:
1. **FlatList Refactor**: 
   - 弃用“三页无限重置”方案，改用 **FlatList** 实现真正的长列表滚动。
   - 生成 ±365 天 (共2年) 的日期列表作为数据源。
   - 利用 FlatList 的 `initialScrollIndex` 定位到今天。
2. **Benefit**:
   - 原生列表滚动性能，支持惯性连续滑动 (Fast Swipe)。
   - 彻底解决“重置延迟”导致的回弹问题。
   - 保持与 WeekStrip 的状态同步。

   - 保持与 WeekStrip 的状态同步。

## 2026-01-23 | 日历顶部日期同步优化

**When**: 2026-01-23 18:20
**Where**: frontend/app/(tabs)/calendar.tsx

**Why**: 用户反馈滑动后顶部的日期跳转延迟过大（原逻辑需等待惯性滚动完全停止才更新）。

**What**:
1. **Real-time Sync**: 
   - 将日期同步逻辑从 `onMomentumScrollEnd` (滚动停止时触发) 更改为 `onScroll` (实时触发)。
   - 使用 `scrollEventThrottle={16}` 确保高频检测。
   - 当页面中心点越过屏幕中线时，**立即更新**顶部 WeekStrip 日期，极大降低了感知延迟。

## 2026-01-23 | UI样式微调

**When**: 2026-01-23 18:25
**Where**: frontend/components/WeekStrip.tsx

**Why**: 用户反馈橙色选中滑块稍微有点大，容易遮挡内容。

**What**:
1. **Remove Scale**: 移除了选中日期背景 (`selectedDayItem`) 的 `scale: 1.05` 放大效果，使其尺寸回归正常，不再产生视觉溢出或遮挡。

## 2026-01-23 | AI 任务解析修复

**When**: 2026-01-23 18:30
**Where**: backend/main.py

**Why**: 用户反馈 AI 将一连串活动（早餐、逛街、高尔夫...）合并为了一个大任务，且日期（"24号"）未能正确识别为具体时间戳，导致日历不显示。

**What**:
1. **Prompt Optimization**:
   - **Task Splitting**: 强制 AI 将描述中的不同活动（如不同时间段、不同地点）拆分为**独立的 Tasks**，而不是合并为 Subtasks。
   - **Date Resolution**: 明确指令处理 "24号" 这种相对日期，强制结合当前时间计算为完整的 `YYYY-MM-DD` 时间戳。
   - **Fix Null Timeline**: 修复了因时间戳为 null 导致任务无法在日历时间轴上显示的问题。

## 2026-01-23 | AI 时间基准优化 (方案二)

**When**: 2026-01-23 21:00
**Where**: 
- frontend/services/api.ts
- backend/main.py

**Why**: 为了彻底解决相对时间（如“明天”、“24号”）的理解偏差问题，决定采用“前端注入本地时间”的方案，消除服务器时区差异带来的影响。

**What**:
1. **Frontend**: 在 API 请求 Header 中新增 `X-Client-Time`，携带用户设备当前的精确本地时间（YYYY-MM-DD HH:MM:SS）。
2. **Backend**: 接收此 Header 并将其作为 Prompt 中的 `Current Time` 传递给 LLM。
3. **Outcome**: 无论用户身处何地，AI 都会基于用户当下的时间来推算日期，确保“今天”、“明天”等概念绝对准确。

## 2026-01-23 | 日历列表与交互优化

**When**: 2026-01-23 21:45
**Where**: 
- frontend/app/(tabs)/calendar.tsx
- frontend/components/WeekStrip.tsx

**Why**: 修复多任务时无法纵向滚动的问题，以及点击日期时界面抽搐和颜色变淡的视觉瑕疵。

**What**:
1. **Vertical Scroll Fix**: 在日历分页容器 (`renderItem`) 中增加 `flex: 1`，确保 `DayTaskView` 能撑满屏幕高度并正确响应纵向滚动，解决了长列表被截断的问题。
2. **Visual Stability**:
   - **No Fading**: 将日期选择按钮的 `activeOpacity` 设为 `1`，取消点击时的变淡效果。
   - **No Twitch**: 确保点击日期时的布局动画被禁用（仅保留横向滚动过渡），消除界面抽搐感。

## 2026-01-23 | 深层优化：滚动、AI与交互

**When**: 2026-01-23 22:15
**Where**: 
- frontend/components/DayTaskView.tsx
- frontend/app/(tabs)/calendar.tsx
- backend/main.py

**Why**: 用户反馈三个关键问题：(1) 多事件时仍无法滚动，(2) Qwen 2.5 7B 仍将独立事件合并为子任务，(3) 点击日期时仍然抽搐。

**What**:
1. **Android 滚动修复**: 在 `DayTaskView` 的 `ScrollView` 中添加 `nestedScrollEnabled={true}`，解决嵌套滚动冲突（Android必需）。
2. **AI Prompt 终极加强**:
   - 添加红色警告符号 ⚠️ 和明确的 BAD ❌ / GOOD ✅ 示例。
   - 使用用户实际输入案例（"24号上午吃早饭，中午回家睡觉，下午去山姆超市"）作为正例。
   - 明确列出"何时使用 subtasks"和"何时分开任务"的规则，针对 Qwen 2.5 7B 的弱点加强提示。
3. **彻底消除抽搐**: 将 `scrollToIndex` 改为 `animated: false`（瞬时跳转），避免与 `onScroll` 事件处理的冲突。

## 2026-01-23 | 终极修复：滚动根因 + 模型调整

**When**: 2026-01-23 22:40
**Where**: 
- frontend/components/TimelineItem.tsx
- backend/config.json
- frontend/app/(tabs)/settings.tsx

**Why**: 用户反馈 (1) 垂直滚动依然无效，(2) Qwen 2.5 7B 能力不足仍然合并任务，(3) 抽搐已解决。

**What**:
1. **滚动根因定位与修复**:
   - **问题根源**: `TimelineItem` 中的时间轴连接线使用了 `h-full`（高度100%），导致在有 `flex: 1` 的父容器中无限扩张。
   - **解决方案**: 将 `h-full` 改为 `flex-grow` + `minHeight: 40`，允许自然增长但不会撑爆容器。
   - **结果**: 多事件时列表高度正常，可完美纵向滚动。

2. **模型配置优化**:
   - 将默认 LLM 从 `Qwen 2.5 7B` 更换为 `Qwen3-8B`（能力更强）。
   - 在模型列表中交换两者位置，Qwen3-8B 置顶。
   - 为 Qwen 2.5 7B 添加 `"快速模型"` 标签，提示其特性。
   - 更新 settings UI 支持显示模型 tag 字段（橙色徽章）。

## 2026-01-24 | 标题冗余清洗

**When**: 2026-01-24 00:45
**Where**: backend/main.py

**Why**: 用户反馈生成的任务标题中包含了重复的日期信息（如 "24号早上去吃饭"），导致显示冗余。

**What**:
1. **Prompt Refinement**: 在 System Prompt 中明确指令 `"Specific Activity Title (e.g. 'Eat Breakfast' NOT '24th Eat Breakfast' - STRIP DATE/TIME)"`，强制 AI 去除标题中的日期和时间修饰词，保持标题纯净。

## 2026-01-24 | 统计页面实现

**When**: 2026-01-24 01:25
**Where**: 
- frontend/app/(tabs)/stats.tsx
- backend/main.py

**Why**: 用户需求实现 VIP 专属的统计分析页面，包含本地任务完成度统计和 AI 驱动的深度分析。

**What**:
1. **Frontend Implementation**:
   - **VIP 门控**: 非 VIP 用户显示升级提示，VIP 用户显示完整统计界面。
   - **Flow Score**: 使用 SVG 圆形进度条可视化完成率（Excellent/Good/Average/Needs Work）。
   - **Task Completion Chart**: 7天/30天双向柱状图（完成任务向上，未完成任务向下）。
   - **Weekly/Monthly 切换**: 独立缓存分析结果。
   - **AI Analysis UI**: Distribution 分布图 + Deep Dive 深度洞察卡片。

2. **Backend API**:
   - 新增 `/api/analyze-tasks` 端点。
   - VIP 权限验证。
   - LLM 自动分类任务（3-5个类别 + 颜色）。
   - 生成简洁洞察（2-3句话）。

3. **Dependency Fix**:
   - 安装 `react-native-svg` 使用 `--legacy-peer-deps` 解决依赖冲突。
   - 修复所有 TypeScript 类型错误。

4. **Monthly Chart Crash Fix (Ultimate)**:
   - 问题：点击"本月"时崩溃（NavigationContext 错误）。
   - 尝试一：按周聚合数据（减少节点） - 未完全解决。
   - 尝试二：修复动态 className 语法 - 未完全解决。
   - 最终解决：**彻底移除 NativeWind**，在图表渲染循环中改用标准 `style` 对象和 `Colors` 常量，完全绕过 CSS 互操作层。



## 2026-01-23 Fix Navigation Context Error
- **When**: 2026-01-23
- **Where**: `frontend/app/_layout.tsx`
- **Why**: iOS 启动时报 “Couldn't find a navigation context”，怀疑根布局上下文不完整，补充安全区 Provider 并简化根布局结构。
- **What**:
  - 将根布局包裹在 `SafeAreaProvider` 中，移除外层 `View`，保持 `Stack` 作为根导航容器的直接子级。

## 2026-01-23 Add NavigationContainer Wrapper
- **When**: 2026-01-23
- **Where**: `frontend/app/_layout.tsx`
- **Why**: iOS 仍报 “Couldn't find a navigation context”，为确保导航上下文存在，显式包裹 `NavigationContainer`。
- **What**:
  - 在根布局中增加 `NavigationContainer`（independent），保证 `Stack/Tabs` 拥有可用的导航上下文。

## 2026-01-27 20:53 | Web Pomodoro UI Connection Fix
- **When**: 2026-01-27 20:53
- **Where**: `frontend/app/(tabs)/web/index.tsx`
- **Why**: `WebHomeScreen` 的 "Active Focus" 卡片未能连接到 `useTimerStore`，导致无法显示实时数据和控制全局计时器。
- **What**:
  - 将 `WebHomeScreen` 中的 "Active Focus" 卡片连接到 `useTimerStore`。
  - 该卡片（位于 "Quote" 模块下方）现在可以显示实时番茄钟数据，并能控制全局计时器，取代了之前的静态占位符。
- **2026-01-27 21:05**: [Backend/Refactor] Strictly enforced Pomodoro logic (Scheme 1).
  - Implemented `JSONEncodedDict` for SQLite/MySQL compatibility.
  - Refactored `pomodoro.py` to use pure functions for stats/pruning.
  - Added Redis `SETNX` deduplication (35d TTL).
  - Added MySQL `with_for_update` locking.

## 2026-01-23 Remove Nested NavigationContainer
- **When**: 2026-01-23
- **Where**: `frontend/app/_layout.tsx`
- **Why**: iOS 提示 NavigationContainer 嵌套冲突，说明 Expo Router 已提供根容器，需要移除手动包裹。
- **What**:
  - 删除 `NavigationContainer` 包裹，恢复由 Expo Router 提供的根导航容器。

## 2026-01-24 | Stats Page Crash Ultimate Fix
- **When**: 2026-01-24 02:40
- **Where**: `frontend/app/(tabs)/stats.tsx`, `frontend/package.json`
- **Why**: Persistent "Couldn't find a navigation context" crash triggered by `react-native-css-interop` internal failures during stats page interactions, exacerbated by missing `expo-linear-gradient` dependency for gradient classes.
- **What**:
  1. Installed `expo-linear-gradient`.
  2. **Complete Rewrite**: Replaced the entire `StatsScreen` component to use standard `StyleSheet` and explicit `LinearGradient` components.
  3. **Removed NativeWind**: Completely eliminated `className` dynamic usage in this file to bypass the crash-prone CSS interop layer.

## 2026-01-24 | Web 端 UI 实现 (Part 1: Home Dashboard)
- **When**: 2026-01-24 16:00
- **Where**: 
  - `frontend/app/(tabs)/index.tsx`
  - `frontend/app/(tabs)/web/index.tsx`
  - `frontend/components/web/*`
  - `frontend/components/ui/CustomModal.tsx`
  - `frontend/hooks/useBanCheck.ts`
  - `frontend/utils/imageUtils.ts`
- **Why**: 实现基于 Stitch 设计规范的响应式 Web 仪表盘。
- **What**:
  1. **响应式路由**: 改造 `index.tsx`，使用 `useWindowDimensions` 在 `HomeScreen` (移动端) 和 `WebHomeScreen` (桌面端) 之间自动切换。
  2. **Web 组件**: 实现了 `Sidebar` (侧边栏)、`WebChatInput` (含圆形文件/麦克风按钮) 和 `WebHomeLayout`。
  3. **功能特性**:
     - **图片压缩**: `imageUtils` 采用迭代算法将上传图片压缩至 500KB 以下。
     - **安全检查**: `useBanCheck` 在用户封禁时拦截操作。
     - **UI 设计**: 使用 NativeWind/Tailwind 实现了 "Today's Focus" 和 "Flow Score" 区域。
     - **自定义弹窗**: 统一了跨平台的 Modal 弹窗体验。

## 2026-01-24 | Web 端 UI 实现 (Part 2: Calendar)
- **When**: 2026-01-24 16:05
- **Where**: 
  - `frontend/app/(tabs)/calendar.tsx`
  - `frontend/app/(tabs)/web/calendar.tsx`
- **Why**: 实现 Web 端桌面版日历界面，对齐 "Stitch" 设计规范。
- **What**:
  1. **WebCalendarScreen**: 实现了全屏日历网格视图，包含 "AI Insight", "Weekly Focus" 和 "Next Up" 侧边栏面板。
  2. **响应式架构**: 更新 `calendar.tsx` 支持在移动端 `MobileCalendarScreen` 和 Web 端 `WebCalendarScreen` 间自动切换。
  3. **功能集成**: 
     - **任务编辑**: 点击日历任务触发 `AppDialog` (CustomModal) 进行编辑/删除。
     - **排序逻辑**: 强制按时间戳对当日任务进行正序排列。
     - **安全风控**: 集成 `useBanCheck`，修改/删除任务前自动校验封禁状态。

## 2026-01-24 | Web 端 UI 实现 (Part 3: Tasks)
- **When**: 2026-01-24 16:10
- **Where**: 
  - `frontend/app/(tabs)/tasks.tsx` (New)
  - `frontend/app/(tabs)/web/tasks.tsx` (New)
  - `frontend/app/(tabs)/_layout.tsx`
- **Why**: 实现专为桌面端设计的任务管理看板，支持三栏布局与批量操作。
- **What**:
  1. **响应式架构**: 创建了 `tasks.tsx` 作为任务页入口，移动端使用简约 Chips 布局，桌面端自动切换至 `WebTasksScreen`。
  2. **导航集成**: 更新 `_layout.tsx`，在下方导航栏添加了独立的 "Tasks" 标签页。
  3. **WebTasksScreen (Stitch)**:
     - **三栏布局**: 左侧导航 + 中间任务列表 + 右侧详情/筛选栏。
     - **批量操作**: 桌面端支持多选框，可批量删除任务（集成 `AppDialog` 二次确认）。
     - **交互增强**: 任务卡片支持 Hover 悬停阴影与微缩放效果。
     - **安全风控**: 新增任务、删除任务均集成了 `useBanCheck` 封禁校验。

## 2026-01-24 | Web 端 UI 实现 (Part 4: Analytics)
- **When**: 2026-01-24 16:15
- **Where**: 
  - `frontend/app/(tabs)/stats.tsx`
  - `frontend/app/(tabs)/web/stats.tsx`
  - `frontend/hooks/useStatsData.ts`
- **Why**: 实现专为桌面端设计的 "Stitch" 风格数据仪表盘，展示心流分数与动态图表。
- **What**:
  1. **WebStatsScreen (Dashboard)**:
     - 实现了多列网格布局，包含 "Flow Score", "Completion Rate" 等核心指标卡片。
     - **动态图表**: 集成 `react-native-chart-kit`，绘制了 "Weekly Flow Trend" (贝塞尔曲线图) 和 "Focus Distribution" (饼图)。
     - **AI 报告**: 实现了 "AI Intelligence Report" 卡片，提供智能洞察。
  2. **useStatsData Hook**:
     - 封装了数据获取逻辑，并内置了 **Ban Check**，若用户被封禁则强制跳转/拦截。
  3. **响应式集成**: 改造 `stats.tsx`，在桌面端 (Width>=768px) 自动呈现 Web 仪表盘。

## 2026-01-24 | Web bundle import.meta 兼容修复

**When**: 2026-01-24 17:14
**Where**: frontend/metro.config.js

**Why**: Web 端报错 "Cannot use 'import.meta' outside a module"，定位到 zustand 的 ESM 入口被解析导致。

**What**:
1. 在 Metro 配置中通过 `extraNodeModules` 强制将 `zustand` / `zustand/middleware` 解析到 CJS 版本，避免 import.meta 进入 web bundle。


## 2026-01-24 | Web import.meta 解析强制兜底
- **When**: 2026-01-24 17:18
- **Where**: frontend/metro.config.js
- **Why**: Web 端仍然报 "Cannot use 'import.meta' outside a module"，说明 Metro 依旧解析到了 zustand 的 ESM 入口。
- **What**:
  1. 新增 `resolveRequest` 自定义解析，硬性将 `zustand` / `zustand/middleware` 指向 CJS 文件，绕开 exports/import 条件分支。

## 2026-01-24 | Web UI Redesign (Part 5)
- **When**: 2026-01-24 17:50
- **Where**: 
  - `frontend/app/(tabs)/_layout.tsx`
  - `frontend/components/web/Sidebar.tsx`
  - `frontend/app/(tabs)/web/index.tsx`
- **Why**: 根据用户反馈重构 Web 端 UI，解决导航混乱问题并对齐新版 Dashbaord 设计。
- **What**:
  1. **Navigation**: 桌面端 (Width>=1024px) 彻底隐藏底部 TabBar，仅使用 Sidebar。
  2. **Sidebar**: 重构为 Logo (Top) + Nav + Profile (Bottom) 结构。实现了 "Settings/Login" 弹出菜单交互。
  3. **Dashboard**: 1:1 复刻 HTML 设计，包含 "Weekly Progress" (Donut), "Active Focus" (Card) 和 "Habit Tracker" 等新组件。

## 2026-01-24 | Web 端中文本地化覆盖

**When**: 2026-01-24 18:09
**Where**:
- frontend/store/useLanguageStore.ts
- frontend/components/web/Sidebar.tsx
- frontend/components/web/WebChatInput.tsx
- frontend/app/(tabs)/web/index.tsx
- frontend/app/(tabs)/web/calendar.tsx
- frontend/app/(tabs)/web/tasks.tsx
- frontend/app/(tabs)/web/stats.tsx

**Why**: 用户设置简体中文但 Web 界面仍为英文，原因是 Web 端组件大量硬编码英文文本未接入语言 store。

**What**:
1. 为 Web 端新增一批翻译 key（Dashboard/Calendar/Tasks/Stats/Chat 等），补齐通用词条（编辑/删除/访客等）。
2. 将 Web 端页面与 Sidebar/Chat 输入框全面改为使用 `t()`，并补充日期与文案拼接逻辑。
3. 修复 Web Chat 输入框错误的 key（改用 `input.placeholder`）并本地化图片处理弹窗文案。
## 2026-01-24 | Web 端功能对齐 Mobile

**When**: 2026-01-24 18:28
**Where**:
- frontend/app/(tabs)/web/index.tsx
- frontend/app/(tabs)/web/calendar.tsx

**Why**: 用户要求让 Web 端具备真实功能，而非仅作为 UI 展示。Mobile 端已具备完善的 AI 对话与任务管理，需要迁移至 Web。

**What**:
1. **Web Home**:
   - 接入 `services/api.ts` 的 `processText`，实现了 Web 版 AI 聊天/任务创建功能 (Global Chat Input)。
   - 移除 "Sample Task" 硬编码，改为从 `useTaskStore` 渲染真实任务列表。
   - "Active Focus" 卡片逻辑对齐：展示第一个未完成的高优先级任务。
   - "Habit Tracker" 增加本地 State 交互（点击切换状态），使其具备演示可用性。
2. **Web Calendar**:
   - 实现了 "New Event" 按钮：调用 `window.prompt` 获取标题并添加真实任务。
   - "Next Up" 模块逻辑实现：计算当前时间之后最近的一个未完成任务。
   - 修复了此前编辑导致的语法错误，重构了文件结构。

## 2026-01-24 | 统计页面实现 (Part 1: Pomodoro Stats Backend)
- **When**: 2026-01-25 21:50
- **Where**: 
    - `backend/models.py`
    - `backend/database.py`
    - `backend/routers/pomodoro.py`
    - `backend/schemas/pomodoro.py`
- **Why**: 实现番茄钟数据的云端同步与趋势分析，同时避免建立高频明细表导致数据量膨胀。
- **What**: 
    1. **Schema**: User模型新增 `pomo_daily_json` (JSONOverText) 及累计字段。
    2. **Redis**: 新增 Redis 客户端用于接口幂等去重。
    3. **Router**: 实现 `POST /pomodoro/end` (写入+自动裁剪历史) 和 `GET /pomodoro/stats` (统计+Streak计算)。

## 2026-01-26 01:25 | Frontend | Pomodoro Integration
- **When**: 2026-01-26 01:25
- **Where**: 
    - `frontend/store/useTimerStore.ts`
    - `frontend/services/api.ts`
    - `frontend/hooks/useStatsData.ts`
- **Why**: 完成番茄钟功能的前端逻辑闭环，实现本地计时与云端统计的无缝同步。
- **What**: 
    1. **Timer Store**: 创建 `useTimerStore`，内置 Pending Queue 机制，确保断网情况下数据不丢失，并在恢复后自动上报。
    2. **Stats Hook**: 接入后端 `/stats` 接口，用真实数据（专注时长、Streak、趋势图）替换了之前的 Mock 数据。

## 2026-01-27 21:05 | Backend | Strict Pomodoro Logic
- **When**: 2026-01-27 21:05
- **Where**: `backend/routers/pomodoro.py`
- **Why**: 严格执行 Scheme 1 (Users Table JSON) 存储方案，确保数据一致性和存储效率。
- **What**:
  - 重构 `pomodoro.py`，实现严格的 30 天裁剪和 Redis 去重 (SETNX)。
  - 引入 `JSONEncodedDict` 类型装饰器，兼容 SQLite/MySQL。
  - 增加 MySQL `with_for_update` 悲观锁逻辑。

## 2026-01-28 17:45 | Frontend | Web Auth
- **When**: 2026-01-28 17:45
- **Where**: `frontend/app/auth/login.tsx`
- **Why**: 完善 Web 端登录流程，对齐 App 端功能并适配桌面 UI。
- **What**:
  - 创建独立的 `auth/login` 页面，采用居中卡片式布局。
  - 移植 App 端 `AccountSection` 的登录/注册逻辑与校验规则。
  - 修复左侧边栏登录按钮的路由跳转问题。

## 2026-01-28 | 后端启动崩溃修复

**When**: 2026-01-28 18:25
**Where**:
- backend/models.py

**Why**: 修复启动时 `IndentationError`，恢复 User 等模型定义，解决后端无法启动导致前端 Failed to fetch。

**What**:
1. 重建 `User/Record/SystemConfig/DeviceUsage` 模型，补齐字段与关系。
2. 恢复番茄钟统计字段与 `JSONEncodedDict`/`MutableDict` 映射。

## 2026-01-28 | 后端启动导入修复

**When**: 2026-01-28 18:30
**Where**:
- backend/schemas/__init__.py

**Why**: 修复 `from schemas import ProcessAudioResponse` 导致的 ImportError，恢复后端可启动。

**What**:
1. 新增 Pydantic schemas：`TaskItem` / `AIParseResult` / `ProcessAudioResponse`。

## 2026-01-28 | 后端聊天路由缺失修复

**When**: 2026-01-28 18:34
**Where**:
- backend/routers/chat.py

**Why**: 修复 `from routers import chat` 导致的 ImportError，确保后端能启动。

**What**:
1. 新增最小可用的 chat 路由模块，提供 `/api/chat/health` 占位端点。

## 2026-01-28 | Web 登录 CORS 修复

**When**: 2026-01-28 18:50
**Where**:
- backend/main.py

**Why**: Web 端从 `http://localhost:8081` 访问后端时被 CORS 拦截，导致登录 Failed to fetch。

**What**:
1. CORS 白名单显式放行开发端 origin（localhost/127.0.0.1/本机 IP 的 8081/19006）。

## 2026-01-28 | Web UUID 兼容修复

**When**: 2026-01-28 18:53
**Where**:
- frontend/utils/uuid.ts

**Why**: HTTP + IP 访问下 Web 不提供 `crypto.randomUUID`，导致启动崩溃。

**What**:
1. 增加 Web `crypto.getRandomValues` 和 `Math.random` 兜底，确保生成 UUID v4。

## 2026-01-28 | Web UUID 再兜底修复

**When**: 2026-01-28 19:54
**Where**:
- frontend/utils/uuid.ts

**Why**: expo-crypto 的 `randomUUID` 在非安全上下文仍会抛错，导致页面启动崩溃。

**What**:
1. 为 `Crypto.randomUUID()` 增加 try/catch，失败时回退到本地 UUID 生成逻辑。

## 2026-01-28 | 登录 500 修复：用户等级枚举兼容

**When**: 2026-01-28 20:04
**Where**:
- backend/models.py

**Why**: 数据库中 `tier` 存储为 `vip/free` 小写，SQLAlchemy Enum 默认使用 `FREE/VIP` 名称，导致读取时报错。

**What**:
1. 将 `User.tier` 的 `SQLEnum` 改为使用枚举 `value`（free/vip），并禁用原生枚举以兼容现有数据。

## 2026-01-28 | 番茄钟交互修复

**When**: 2026-01-28 20:35
**Where**:
- frontend/components/FocusTimerWidget.tsx
- frontend/store/useTimerStore.ts

**Why**: 解决番茄钟缺少重置按钮、悬浮胶囊不可拖动、计时不走的问题。

**What**:
1. 增加 `reset` 动作并在界面提供重置按钮。
2. 悬浮胶囊加入拖拽逻辑并限制在屏幕范围内。
3. 在运行状态启用 1s tick，保证计时实时更新。

## 2026-01-28 | Web 番茄钟卡片补齐交互

**When**: 2026-01-28 20:40
**Where**:
- frontend/store/useTimerStore.ts
- frontend/components/FocusTimerWidget.tsx
- frontend/components/web_screens/WebHomeScreen.tsx

**Why**: Web 端番茄钟卡片缺少重置按钮，无法切换正计时/倒计时，也无法选择倒计时长度。

**What**:
1. TimerStore 增加 `mode` 与 `setMode`，兼容正计时/倒计时。
2. 计时逻辑支持正计时增长、倒计时归零完成。
3. Web 番茄钟卡片补充重置按钮、计时模式切换与时长快速选择。
