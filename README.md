# Lantern (Lighthouse)

服务品牌升级内部展示平台，围绕四个模块组织内容：

- `Mirror / 镜鉴`：案例研究与外部标杆解析
- `Heart / 本心`：价值观、文化与共识
- `Action / 笃行`：行动路径与实践案例
- `Hermit / 路引`：决策辅助与思辨空间

## 技术栈

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS 4
- ESLint 9

## 本地开发

```bash
npm install
npm run dev
```

默认地址：`http://localhost:3000`

## 常用命令

```bash
npm run dev    # 启动开发环境
npm run lint   # 代码检查
npm run build  # 生产构建
npm run start  # 启动生产服务
```

## 目录结构

```text
src/
  app/
    page.tsx                  # Mirror 首页
    heart/page.tsx            # Heart
    action/page.tsx           # Action
    hermit/page.tsx           # Hermit
    mirror/pang-dong-lai/     # 胖东来案例页
  components/
    layout/                   # AppShell / Navigation / Header
    ui/                       # FeatureCard 等 UI 组件
```

## 近期优化（2026-03-02）

- 修复全部 ESLint errors（含 JSX 未转义字符）。
- 清理未使用导入/变量，消除对应 warnings。
- 将 `heart / action / hermit` 预览图从 `<img>` 升级到 `next/image`。
- 移除 `AppShell` 中 `style jsx`，改为 Tailwind 响应式写法。
- 新增移动端导航抽屉、可用搜索和通知面板交互。
- 更新 `html lang` 为 `zh-CN`，统一品牌标题为 `Lantern | Lighthouse`。

## 下一步建议

- 将 `public/` 大尺寸 PNG 转换为 WebP，并按展示尺寸重采样，继续降低首屏图片负载。
