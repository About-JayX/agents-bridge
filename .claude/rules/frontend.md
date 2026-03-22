---
paths:
  - "src/**/*.{ts,tsx}"
---

# 前端开发规范

## 技术栈
- React 19 + TypeScript + Vite
- **Tailwind CSS v4** — 样式优先用 Tailwind class，不用 inline styles
- **shadcn/ui** — UI 组件库，组件在 `src/components/ui/`，用 `npx shadcn@latest add <component>` 添加
- **Zustand** — 状态管理，store 放 `src/stores/`
- **Lucide React** — 图标库
- **clsx + tailwind-merge** — `cn()` 工具函数在 `src/lib/utils.ts`

## 样式规范
- 纯暗色主题（html 标签带 `class="dark"`）
- 用 shadcn/ui 语义色彩变量（`bg-background`, `text-foreground`, `bg-card` 等）
- Agent 专属颜色: `text-claude`(紫) `text-codex`(绿) `text-system`(灰)
- 路径别名: `@/` 映射 `src/`

## 状态管理
- Zustand store 替代自定义 hooks 中的 useState
- WebSocket 连接逻辑放在 store 中，组件通过 selector 订阅
- 避免在组件中直接管理复杂状态

## 组件规范
- shadcn/ui 组件优先，不重复造轮子
- 自定义组件放 `src/components/`，shadcn 组件在 `src/components/ui/`
- TypeScript 配置用 tsconfig.app.json

## 文件规模
- **每个文件最多 500 行**，超过必须拆分为独立模块/组件

## 封装与抽离
- 可复用的 UI 单元必须抽为独立组件（如 `UsageBar`、`StatusDot`、`SourceBadge`）
- 业务逻辑与展示分离：store 负责状态和 side-effect，组件只做渲染
- 类型定义集中在 `src/types.ts`，不在组件内重复声明

## 层级与布局
- 弹出层（下拉菜单、Popover、Tooltip）使用 `z-50` 且父容器**禁止** `overflow-hidden`，否则弹出层会被截断
- 需要圆角裁剪时在子元素上单独加 `rounded-*`，不要用父级 `overflow-hidden` 兜底
- 每个可滚动区域独立设置 `overflow-y-auto min-h-0`，避免整个页面滚动

## 性能优化
- Zustand selector 按字段订阅，避免整个 store 重渲染
- 大列表使用 `React.memo` 或虚拟滚动
- 避免在 render 中创建新对象/函数，用 `useMemo`/`useCallback` 保持引用稳定
- 条件渲染优先于 `display:none`

## 代码检查
- 每次修改后必须执行 `npx tsc --noEmit -p tsconfig.app.json` 确保零类型错误
- 不允许 `any` 类型逃逸到组件 props，daemon 边界数据用明确类型断言
