# AGENTS.md

## 项目定位

本仓库现在以 Prompt Gallery Web App 为主线，目标是成为一个可部署的标准 Web 项目。

迁移期仍保留 GPT Image 2 中文 Gallery 原件库，但它只作为导入和验证数据源存在，不再污染项目根目录。Codex 官方插件中文清单已经迁出到 `/Users/godw/code/codex-plugins`，不要在本仓库继续维护插件清单业务线。

除非用户明确提出，不要在本项目中实现 GPT Image 2 API 调用、生成客户端或自动出图流程。

## 目录结构

- `web/`：正式 Web App，包含 React 前端、本地 Node API、脚本、测试和当前 Supabase 迁移期代码。
- `data/gallery/index.md`：迁移期 Gallery 分册索引。
- `data/gallery/gallery<n>.md`：迁移期中文提示词分册。
- `data/gallery/assets/case<n>.jpg`：迁移期 Gallery 示例图片。
- `data/images/`：本地 MaaS 测试图片。
- `docs/deployment/`：部署文档。
- `docs/handoff/`：交接记录。
- `docs/superpowers/`：设计和实施计划。
- `.codex/skills/get-image-prompt/SKILL.md`：迁移期图片匹配提示词工作流 skill。

## 内容规则

- 提示词只保留中文。
- 每个案例只保留标题、示例图片和一个提示词代码块。
- 案例条目不保留来源信息。
- 新增迁移期案例时，图片使用下一个可用的 `case<n>.jpg` 文件名，放入 `data/gallery/assets/`，并同步更新 `data/gallery/index.md`。
- 除非用户明确要求重编号，否则保留现有案例编号。
- 如果无法稳定判断案例主题，放入 `其他应用场景`，不要临时发明新主题。

## 图片到提示词工作流

1. 用户上传一张图片。
2. 分析图片的主体、场景、风格、构图、可见文字、比例和不确定点。
3. 搜索 `data/gallery/gallery*.md`，选择 3 个最适合的提示词案例。
4. 给出 3 个候选，每个候选包含案例编号、标题、匹配理由和需要调整的点。
5. 等待用户选择一个候选，不要跳过选择步骤。
6. 对选中提示词做主体锚点式最小适配改写：把上传图主体绑定到候选 prompt，保留候选 prompt 的目标场景、服装、道具、构图、光线、文字和风格；不要把上传图内容重写成全新场景。
7. 输出最终中文提示词，供用户连同图片一起发送给网页版 ChatGPT。

## 变更纪律

- 改动要小，并且直接服务于 Web App、Gallery 迁移期数据、图片匹配工作流或华为云部署迁移。
- 不要恢复 `learn/`、Codex 插件清单或其他已迁出的资料型业务线。
- 不要添加无关工具、自动化、构建系统或大段说明文档。
- 完成结构迁移或大批量整理后，用命令验证结构和链接。

## PR 提交前验证

- 每次完成一个具体开发任务并准备提交 PR 前，必须通过 `[@浏览器](plugin://browser-use@openai-bundled)` / Browser Use 插件进行详细真实浏览器核验。
- Browser Use 核验应覆盖用户主路径、关键交互、错误提示、视觉布局和本次 PR 相关验收项，并在 PR 描述或测试报告中写明验证结果。
- 本仓库禁用 `playwright-cli` 作为 PR 验收测试工具；不要新增 `.playwright-cli/`、Playwright CLI 截图、DOM 快照或日志作为常规产物。
- 如果 Browser Use 的 IAB backend 不可用，应先修复 Codex / Browser Use 配置或明确记录阻塞；不要直接用 Playwright CLI 替代并宣称浏览器验收完成。
