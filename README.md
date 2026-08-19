# cerebro-graph

> 文档图谱，所图甚大。

## 关键文档

- **[BACKLOG.md](BACKLOG.md)**：决策记录 + 全部待办（fork 配置、格式扩展、后续迭代）——**新讨论的未决事项先记这里**
- `dsh-doc-graph/docs/superpowers/specs/dsh-doc-graph-spec.md`：**最终生效规格**（实现据此编码）
- `dsh-doc-graph/docs/spec-design-review.md`：审阅记录（R-001~R-018 已复核采纳）
- `dsh-doc-graph/docs/dsh-mock-demo-v5.html`：最终交互原型
- `dsh-doc-graph/docs/ui-design.md` / `ui-design.html` / `spec-design.md`：历史参考

## 仓库结构

```text
cerebro-graph/
├── dsh-doc-graph/                 # DSH 插件（TypeScript / Cordis）
│   ├── docs/
│   │   ├── superpowers/specs/
│   │   │   └── dsh-doc-graph-spec.md   # 最终生效规格
│   │   ├── spec-design-review.md       # 审阅记录（已复核）
│   │   ├── spec-design.md              # 历史 spec
│   │   ├── dsh-mock-demo-v5.html       # 最终交互原型
│   │   └── ui-design.md / ui-design.html / dsh-mock-demo.html  # 历史参考
│   ├── src/                       # 源码（待实现，结构见 spec §2.1）
│   ├── assets/
│   ├── package.json               # 待实现（spec §12 已定义）
│   ├── cordis.patch.yml           # 待实现
│   └── README.md
└── cerebro-graph-doc-core/        # fork 自 Detective-XH/DocGraph（Go）
    └── …上游源码，后续扩展格式（.txt/.rst/.tex/.odt/.epub/OCR PDF）
```

## 当前状态

- [x] 目录结构创建
- [x] DocGraph 上游 clone 到 `cerebro-graph-doc-core`（remote: upstream）
- [x] UI 设计文档与需求稿（`ui-design.md` / `ui-design.html`）
- [x] 最终交互原型（`dsh-mock-demo-v5.html`）
- [x] Spec 审阅复核（`spec-design-review.md` R-001~R-018 全部采纳）
- [x] **最终生效规格**（`docs/superpowers/specs/dsh-doc-graph-spec.md`）
- [x] 决策记录与待办（`BACKLOG.md`）
- [ ] GitHub fork 配置（本机无 gh CLI，需在 GitHub 网页 fork 后设置 origin）
- [ ] 场景预设与 MVP 缺口分析（待用户提供场景）
- [ ] 实现计划（writing-plans 格式）
