# Prompt Gallery 简化改造 PR 交接文档

Date: 2026-05-07

本文档用于把 ImageOdyssey Web App 的简化改造任务交接给协作者。请协作者通过独立分支和 PR 完成具体编码，不要直接在主分支上修改。

## 背景

当前应用包含完整的本地工作流：上传 Source Image、请求 AI 推荐、调用视觉模型理解图片、选择 Gallery 案例、改写 Prompt、上传 Result Image、保存实验记录。

下一步希望把应用收敛成更轻量的 Prompt Gallery 工具：只保留 Gallery 浏览、分类筛选和基于选中案例的 DeepSeek 文本改写。用户仍然会在 ChatGPT 网页中自行上传图片，本项目不再接收、存储或分析图片。

## 目标流程

新版本的用户路径如下：

1. 用户打开 Gallery 页面。
2. 用户通过分类按钮筛选案例，`全部` 分类仍保留。
3. 用户点击一个案例卡片。
4. 底部区域显示原始 Prompt。
5. 用户点击 `改写为图片主体版本`。
6. 后端调用 DeepSeek，只做文本改写。
7. 改写结果用于用户复制到 ChatGPT；用户在 ChatGPT 中自行上传图片并生成。

改写的核心含义是：保持原 Prompt 的主要描述、场景、风格、构图、光线、文字、道具和视觉语言不变，但把主体表达改成“以用户稍后在 ChatGPT 中上传的图片主体为主体”。不要让 DeepSeek 编造或描述图片内容，因为本系统不再接收图片。

## 需求范围

必须删除或停用：

- 前端左侧 `Source Image` 上传框。
- 前端左侧 `Result Image` 上传框。
- 文件选择、上传、预览和 blob URL 生命周期逻辑。
- 搜索输入框。
- `推荐` 按钮。
- 推荐请求、推荐高亮、推荐排序逻辑。
- 实验保存链路。
- 视觉模型链路。
- 对 `source_image_storage_path` 的运行依赖。

必须保留：

- Gallery 卡片展示。
- 分类筛选。
- 选中案例。
- 底部 Prompt 展开/收起。
- DeepSeek 文本改写。
- 当前 Gallery 数据读取方式；本 PR 不做 Supabase 到华为云 RDS/OBS 的迁移。
- `data/gallery/` 迁移期归档数据。

不要做：

- 不要恢复已删除的 `.codex` skill。
- 不要恢复已删除的 `web/scripts` Gallery 导入脚本。
- 不要改动 `data/gallery/` 内容。
- 不要在本 PR 中做华为云部署、RDS、OBS 或 CDN 迁移。

## 建议改动点

前端主要入口是 `web/src/App.tsx`：

- 删除 `ImageUploadPanel` 的使用。
- 删除 source/result preview、upload busy、storage path、recommend busy、recommended case numbers 等状态。
- 删除 `handleSourceSelected`、`handleResultSelected`、`handleRecommend`。
- `filteredCases` 只根据 `selectedCategory` 计算。
- `canRewrite` 只依赖 `selectedCase` 和 `rewriteBusy`。
- `handleRewrite()` 调用新的 rewrite 请求体：

```ts
requestRewrite({
  case_number: selectedCase.case_number,
  original_prompt_text: selectedCase.prompt_text
});
```

API client 主要入口是 `web/src/lib/apiClient.ts`：

- 删除 `requestRecommendations`。
- 删除 `uploadExperimentImage`。
- 删除 `saveExperiment`。
- 保留 `requestRewrite`。
- 如仍需记录错误，可保留 `logWorkflowEvent`。

后端主要入口是 `web/server/routes.ts`：

- 删除 `/api/recommend`。
- 删除 `/api/experiment-images`。
- 删除 `/api/experiments`。
- `/api/rewrite` 的 schema 删除 `source_image_storage_path`。
- 删除 `multer`、上传文件名清洗、experiment insert 等上传/保存相关代码。

MaaS bridge 主要入口是 `web/server/maasBridge.ts`：

- 删除 `describeSourceImage()`。
- 删除 `resolveSourceImageDataUrl` 依赖。
- 删除 `image_url` message 分支。
- `rewrite()` 只调用一次文本模型。
- DeepSeek prompt 必须明确：
  - 保持原 Prompt 的主要含义不变。
  - 保留原场景、风格、构图、光线、文字、道具和视觉语言。
  - 不要编造用户图片内容。
  - 将主体表达改为“以用户稍后在 ChatGPT 中上传的图片主体为主体”。
  - `rewritten_prompt_text` 必须是自然语言中文 Prompt，不要输出 JSON、Markdown 或字段清单。

类型清理：

- `web/server/types.ts` 删除 `RecommendRequest`、`RecommendResponse`。
- `RewriteRequest` 删除 `source_image_storage_path`。
- 当前不再引用的 `ExperimentInsert` 类型可以删除；如果担心影响后续数据库迁移，也可以暂时保留，但不能再被本流程使用。

文件清理：

- 如果 `web/src/components/ImageUploadPanel.tsx` 不再被引用，删除。
- 如果 `web/server/sourceImageCache.ts` 不再被引用，删除。
- 删除或重写对应测试。

## 建议 UI 文案

- 改写按钮：`改写为图片主体版本`
- 未选择案例提示：`选择一个案例后，可将原 Prompt 改写为适合搭配 ChatGPT 上传图片使用的版本。`
- 改写中：`改写中...`
- 原 Prompt 空态：`先选择一个案例后，这里会显示原始 Prompt。`
- 改写 Prompt 空态：`点击“改写为图片主体版本”后，这里会显示改写后的 Prompt。`

## PR 协作要求

请从当前工作分支切出独立分支，例如：

```bash
git checkout -b codex-simplify-gallery-rewrite
```

PR 标题建议：

```text
Simplify gallery rewrite workflow
```

PR 描述需要写明：

- 删除了上传、推荐、视觉模型和实验保存链路。
- Gallery 只保留分类筛选。
- DeepSeek 改写变成纯文本“图片主体版本”改写。
- 测试命令结果。
- Browser Use 验收结果。

## 验收标准

命令验证必须通过：

```bash
npm -C web test
npm -C web run build
npm -C web run lint
```

前端测试应覆盖：

- 页面不再出现 `Source Image`。
- 页面不再出现 `Result Image`。
- 页面不再出现搜索框。
- 页面不再出现 `推荐` 按钮。
- 分类按钮仍可筛选 Gallery。
- 选择案例后底部显示原 Prompt。
- 点击 `改写为图片主体版本` 会调用新的 rewrite 请求体。

后端测试应覆盖：

- `/api/rewrite` 接收 `{ case_number, original_prompt_text }`。
- `/api/rewrite` 不要求 `source_image_storage_path`。
- `maasBridge.rewrite()` 只调用文本 MaaS 一次。
- MaaS 请求内容不包含 `image_url`。
- MaaS prompt 包含“以用户稍后在 ChatGPT 中上传的图片主体为主体”的约束。

删除或更新旧测试：

- 推荐相关测试。
- 上传相关测试。
- experiment 保存相关测试。
- source image cache 相关测试。
- vision model env 相关测试。

Browser Use 验收：

```bash
npm -C web run dev:all
```

需要在真实页面检查：

- 首屏只有 Gallery 主界面。
- 无左侧上传栏。
- 无搜索框。
- 无推荐按钮。
- 分类筛选可用。
- 选择案例后可展开 Prompt。
- 点击改写后返回的 Prompt 是“图片主体版本”。
- 浏览器控制台无明显错误。

## 交付边界

本 PR 完成后，ImageOdyssey 应成为一个更简单的 Gallery + Prompt rewrite 工具。华为云部署、RDS/OBS 迁移、Gallery 数据导入和生产部署验证仍是后续独立任务。
