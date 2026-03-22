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
