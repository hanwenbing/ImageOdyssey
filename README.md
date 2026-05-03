# ImageOdyssey

ImageOdyssey 是一个围绕 GPT Image 2 中文提示词工作流整理的本地项目。目前仓库包含三部分内容：

1. GPT Image 2 中文提示词资料库。
2. Prompt Gallery Web App，本地可视化选择、推荐和改写提示词的网页工具。
3. Codex 官方插件中文清单。

这个项目当前不是公开在线服务，也不是 GPT Image 2 API 客户端。Prompt Gallery Web App 的第一版目标是帮助用户在本地上传参考图、浏览 Gallery 案例、选择提示词、通过本地 Codex CLI 桥接服务改写提示词，然后手动把改写后的提示词发送到 ChatGPT 生成图片。

## 当前状态

- Gallery 资料库已经存在，入口是 `index.md`，各主题分册是 `gallery*.md`，示例图片在 `assets/`。
- Web App 已完成前 4 个阶段：
  - Task 1：`web/` Vite + React + Tailwind + TypeScript 脚手架。
  - Task 2：Supabase schema、RLS/storage 基础策略和共享类型。
  - Task 3：Gallery Markdown parser。
  - Task 4：Supabase import / validate 脚本。
- Web App 还没有完成最终可用界面，后续应从 Task 5 继续。
- 交接文档在 `docs/handoff/prompt-gallery-web-handoff.md`。
- 完整设计和实施计划在：
  - `docs/superpowers/specs/2026-05-02-prompt-gallery-web-design.md`
  - `docs/superpowers/plans/2026-05-02-prompt-gallery-web-implementation.md`

## 主要目录

```text
index.md                         # Gallery 总入口
gallery*.md                      # GPT Image 2 中文提示词分册
assets/                          # Gallery 示例图片
web/                             # Prompt Gallery Web App
docs/handoff/                    # 交接文档
docs/superpowers/                # 设计与实施计划
docs/codex-plugins/              # Codex 官方插件中文清单
data/codex-plugins/              # 插件中文资料和分类修正数据
tools/                           # 本地资料生成工具
```

## Web App 本地开发

安装依赖：

```bash
npm -C web install
```

常规验证：

```bash
npm -C web test
npm -C web run build
npm -C web run lint
```

启动前端开发服务器：

```bash
npm -C web run dev
```

当前 `web/` 还没有实现本地 Node API，因此不要提前添加或依赖 `server` / `dev:all` 脚本。后续应在实现 Local Codex Bridge API 时再添加。

## Supabase 导入

Web App 使用 Supabase 存储 Gallery 元数据、提示词、示例图片和后续实验记录。导入 Gallery 前需要配置：

```bash
SUPABASE_URL="https://..."
SUPABASE_SERVICE_ROLE_KEY="..."
VITE_SUPABASE_URL="https://..."
VITE_SUPABASE_PUBLISHABLE_KEY="..."
```

先应用 SQL：

```text
web/supabase/migrations/0001_prompt_gallery_schema.sql
web/supabase/migrations/0002_restrict_experiment_access.sql
```

然后运行：

```bash
npm -C web run import:gallery
npm -C web run validate:gallery
```

当前 Gallery 预期校验结果：

```json
{
  "categories": 13,
  "prompt_cases": 352,
  "known_missing_prompt_numbers": [12, 169, 170]
}
```

如果没有 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`，导入和校验脚本会明确失败，不会伪造成功。

## 继续开发入口

同事接手时请先阅读：

```text
docs/handoff/prompt-gallery-web-handoff.md
```

后续开发从实施计划的 Task 5 开始：

1. Task 5：实现 Local Image Cache 与 Codex Bridge core。
2. Task 6：暴露本地 API routes，包括 `/api/recommend`、`/api/rewrite`、`/api/experiment-images`、`/api/experiments`。
3. Task 7：实现 Gallery 数据读取、搜索、分类过滤和推荐排序。
4. Task 8：实现 Two-Pane Studio UI 和底部 Prompt Bar。
5. Task 9：连接前端、Supabase 和本地 API。
6. Task 10：本地端到端 smoke test。
7. Task 11：准备 cleanup proposal。

## 安全和协作边界

- 不要把 `SUPABASE_SERVICE_ROLE_KEY` 暴露到浏览器代码。
- 浏览器端不要直接写入 `experiments`，也不要直接上传到私有的 `experiment-images` bucket；这些操作应走本地 Node API。
- 不要添加通用 shell execution API。Local Codex Bridge 只允许固定的推荐和改写任务。
- 不要在第一版加入 GPT Image 2 API 调用。
- 不要删除 `index.md`、`gallery*.md`、`assets/case*.jpg`，除非 Gallery 迁移和 smoke test 已验证，并且用户明确批准 cleanup。
- 不要依赖或修改 `learn/my-app`，它不是正式 Web App 的实现入口。

## 协作流程建议

推荐使用 fork + pull request：

1. 从本仓库 fork。
2. 在 fork 中为每个任务新建 feature branch。
3. 完成一个清晰阶段后提交 pull request。
4. PR 描述中写明变更范围、验证命令、未验证项和是否需要 Supabase 环境变量。
5. 维护者 review 通过后再 merge 到 `main`。
