# Prompt Gallery 云端化精简改造设计

日期：2026-05-07

## 背景

ImageOdyssey Web App 当前包含本地图片工作流：上传 Source Image、推荐案例、视觉理解、Prompt 改写、上传 Result Image、保存实验记录。下一阶段目标是精简为适合上云的 Prompt Gallery 工具。

新版本不再接收、存储或分析用户图片。用户会在 ChatGPT 网页中自行上传人物照片。本项目只负责浏览 Gallery、选择案例，并把选中案例的 Prompt 改写成人物参考图适配版本。

## 目标

本次改造一次性完成两件事：

1. 功能强精简：删除上传、推荐、视觉模型、实验保存、workflow event、本地 Codex CLI bridge 和 source image cache。
2. 架构上云化：迁移到前后端分离的 npm workspaces 结构，前端只调用后端 API，后端持有华为云 MaaS 密钥和 Gallery 数据源连接。

## 非目标

- 不实现 GPT Image 2 API 调用。
- 不接收用户上传图片。
- 不保存用户实验记录。
- 不做华为云 RDS、OBS、CDN 或生产部署本身。
- 不保留 Supabase 作为正式运行依赖。
- 不把本地 `gallery*.md` / `index.md` 解析逻辑包装成长期核心模块。
- 不让 `gallery*.md` / `index.md` 继续作为最终项目根目录文件存在。

## 最终项目结构

采用 npm workspaces，不引入 Turborepo。当前项目只有一个前端和一个 API，引入 Turborepo 会增加配置复杂度，后续 CI 或缓存需求变明显时再加。

```text
apps/
  web/
    src/
      App.tsx
      lib/apiClient.ts
      types.ts
      ...
    index.html
    package.json
    tsconfig.json
    vite.config.ts
  api/
    src/
      index.ts
      app.ts
      routes/
        gallery.ts
        rewrite.ts
      services/
        huaweiMaasClient.ts
        promptRewriteService.ts
      repositories/
        galleryRepository.ts
        fileGalleryRepository.ts
      config/
        env.ts
    package.json
    tsconfig.json
packages/
  shared/
    src/
      gallery.ts
      rewrite.ts
      index.ts
    package.json
data/
  gallery/
    categories.json
    prompt-cases.json
    featured-case-numbers.json
docs/
package.json
package-lock.json
```

### 边界

- `apps/web` 只包含 React、Vite、Tailwind CSS 和浏览器代码。
- `apps/api` 只包含 Hono API、服务端配置、Gallery repository 和华为云 MaaS 调用。
- `packages/shared` 只包含纯类型和 schema，不能依赖 React、Node 专属 API、Supabase 或华为云客户端。
- 前端不直接读取 Supabase、数据库或文件数据库。
- 后端 repository 隐藏 Gallery 数据源。后续从文件数据源切到 RDS 时，前端 API 合约不变。
- 根目录不再保留 `gallery*.md`、`index.md` 或 Gallery 图片资产。最新主干已把这些资料移入 `data/gallery/` 作为迁移期归档；完成结构化数据校验后可以删除或停止运行时引用。

## 后端框架选择

后端从 Express 改为 Hono。

选择 Hono 的原因：

- Hono 基于 Web Standards / Fetch API，适合未来在 Node.js、云函数、边缘运行时之间迁移。
- 当前 API 很小，只有 Gallery 读取和 Prompt 改写，不需要 NestJS 的重型模块体系。
- 比 Express 更现代，TypeScript 路由和请求处理更简洁。
- 比绑定 Bun 生态的框架迁移风险低。

## API 设计

### `GET /api/categories`

返回分类列表。前端分类按钮至少包含：

- `精选`
- `全部`
- 业务分类

### `GET /api/prompt-cases?scope=featured`

返回稳定的精选案例列表，约 12 个。

精选列表不能每次真正随机。应使用稳定规则，例如数据源中的 `featured` 标记、固定 case number 列表，或迁移期的稳定抽样规则。稳定结果方便缓存、测试和用户刷新后的体验一致性。

### `GET /api/prompt-cases?scope=all`

返回完整 Gallery 案例列表。当前约 300 多条数据，不需要在本 PR 中实现复杂分页。后续数据量明显增长后再扩展 `limit` / `cursor`。

### `POST /api/rewrite`

请求体：

```ts
{
  case_number: number;
  original_prompt_text: string;
}
```

响应体：

```ts
{
  rewritten_prompt_text: string;
}
```

不再接收 `source_image_storage_path`，也不允许请求内容包含 `image_url` 或其他图片字段。

## 前端体验

进入主界面后默认选中 `精选` 分类，只展示约 12 个案例。这样避免进入网站时一次性加载全部图片，降低网速不足导致图片加载失败或长时间空白的风险。

首屏加载流程：

1. 请求 `GET /api/categories`。
2. 请求 `GET /api/prompt-cases?scope=featured`。
3. 渲染约 12 个精选案例。
4. 等精选图片全部触发 `onLoad` 或 `onError` 后，再后台请求 `GET /api/prompt-cases?scope=all`。
5. 非首屏图片使用 `loading="lazy"`。
6. 图片加载失败时显示稳定占位，卡片尺寸不跳动。

主界面结构：

- 顶部品牌区。
- 分类按钮区。
- Gallery 卡片网格。
- 底部固定 Prompt dock。

删除的界面元素：

- `Source Image` 上传框。
- `Result Image` 上传框。
- 搜索输入框。
- `推荐` 按钮。
- 推荐高亮和推荐排序。
- 实验保存入口。

保留和调整的界面元素：

- Gallery 卡片展示。
- 分类筛选。
- 选中案例。
- 底部原 Prompt 展开/展示。
- `改写为图片主体版本` 按钮。
- 改写结果展示和复制。

建议文案：

- 改写按钮：`改写为图片主体版本`
- 原 Prompt 空态：`先选择一个案例后，这里会显示原始 Prompt。`
- 改写 Prompt 空态：`点击“改写为图片主体版本”后，这里会显示改写后的 Prompt。`
- 改写中：`改写中...`

## 人物参考图适配改写

用户通常会在 ChatGPT 网页上传一张人物照片，然后粘贴本系统生成的 Prompt。生成结果应参考上传照片中的人物，尽量保持其样貌、神态和人物身份特征基本不变，同时继承原 Prompt 的其他视觉设定。

后端改写服务必须把以下规则写入 MaaS prompt：

1. 在改写后的 Prompt 开头自然加入类似语义：`以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变，...`
2. 删除或弱化原 Prompt 中可能与上传人物冲突的人物固有设定。
3. 需要删除或弱化的内容包括年龄、性别、种族、国籍、脸型、发型、五官、明确样貌、明确神态等会改变人物身份特征的描述。
4. 尽量保留原 Prompt 中不冲突的场景、风格、构图、光线、色彩、服装、道具、画面文字、视觉语言、镜头和质感描述。
5. 输出必须是一段通顺自然的中文 Prompt。
6. 不输出解释、JSON、Markdown、字段清单或 key-value 结构。

示例：

原 Prompt：

```text
生成一个20岁的女性，穿着复古红裙，站在夜晚街头霓虹灯下，电影感光线，浅景深。
```

改写方向：

```text
以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变，穿着复古红裙，站在夜晚街头霓虹灯下，电影感光线，浅景深。
```

这里删除 `20岁的女性`，保留红裙、夜晚街头、霓虹灯、电影感光线和浅景深。

## 华为云 MaaS 调用

服务端通过华为云 MaaS V2 Chat API 调用 DeepSeek 文本模型。

必需环境变量：

```text
HUAWEI_MAAS_API_KEY
HUAWEI_MAAS_CHAT_COMPLETIONS_URL
HUAWEI_MAAS_MODEL
```

缺失必需配置时必须明确失败，不静默使用默认值。

请求约束：

- 使用 `Authorization: Bearer <api key>`。
- body 包含 `model` 和 `messages`。
- 不包含 `image_url`。
- 不包含任何用户图片路径、图片 URL 或图片数据。

参考资料：

- 华为云 MaaS 标准 API V2：https://support.huaweicloud.com/usermanual-maas/usermanual_maas_0021.html
- Hono 文档：https://hono.dev/docs/
- npm workspaces 文档：https://docs.npmjs.com/cli/v8/using-npm/workspaces/?v=true

## 数据源策略

本地 Markdown 文件是迁移期输入或归档资料，不应作为长期核心模块，也不应保留在项目根目录。

当前最新主干已将 `gallery*.md`、`index.md` 和 `assets/case*.jpg` 从根目录移到 `data/gallery/`，作为迁移期归档资料。但本设计要求运行时不依赖 Markdown：后端 Gallery repository 应从更接近线上形态的数据源读取，例如 `data/gallery` 下的结构化 JSON、文件数据库，或后续的 RDS。若现有结构化数据不足，可以在实现计划中安排一次只服务迁移的数据转换，但不要新增 `packages/gallery` 作为长期 parser 包。

`data/gallery` 的迁移期建议结构：

```text
data/gallery/
  categories.json
  prompt-cases.json
  featured-case-numbers.json
```

这些文件是后端 repository 的临时文件数据源。后续切到华为云 RDS 时，删除或停用该文件数据源，只保留新的 repository 实现。

后续从文件数据源迁到华为云 RDS 时，替换 repository 实现即可。

## 测试与验收

命令验证使用根目录 workspace 命令：

```bash
npm test
npm run build
npm run lint
```

### 前端测试

- 默认进入 `精选` 分类。
- 首屏只渲染约 12 个精选案例。
- 首屏图片加载完成后才请求或预取全部案例。
- 页面不出现 `Source Image`、`Result Image`、搜索框、`推荐` 按钮、实验保存入口。
- 分类按钮可筛选 Gallery。
- 选中案例后底部显示原 Prompt。
- 点击 `改写为图片主体版本` 调用 `POST /api/rewrite`。
- rewrite 请求体只有 `case_number` 和 `original_prompt_text`。
- 改写结果展示在底部区域并可复制。

### 后端测试

- `GET /api/categories` 返回 `精选`、`全部` 和业务分类。
- `GET /api/prompt-cases?scope=featured` 返回稳定的约 12 个精选案例。
- `GET /api/prompt-cases?scope=all` 返回完整案例列表。
- `POST /api/rewrite` 接收 `{ case_number, original_prompt_text }`。
- `/api/rewrite` 不要求 `source_image_storage_path`。
- MaaS 请求使用 `Authorization: Bearer ...`，包含配置的 model。
- MaaS 请求不包含 `image_url` 或图片字段。
- MaaS prompt 包含人物参考图适配目标。
- MaaS prompt 要求删除或弱化年龄、性别、外貌、神态等会和上传人物冲突的人物固有设定。
- 缺少 MaaS 必需环境变量时明确失败。

### Build Web Apps 验收

完成实现后必须按 Build Web Apps 插件的 `frontend-testing-debugging` 流程做真实浏览器验收，优先走 Browser 插件路径。命令验证不能替代浏览器验收。

目标流：

```text
app loads -> 精选首屏渲染约 12 个案例 -> 分类筛选 -> 选中案例 -> Prompt dock 显示原 Prompt -> 点击改写 -> 显示人物参考图适配版 Prompt
```

必须检查：

- Page identity：URL 和 title 正确。
- Not blank：DOM 有真实 App 内容。
- No framework overlay：无 Vite/React 错误覆盖层。
- Console health：无相关 error/warn；如果有，必须解释。
- Screenshot evidence：提供桌面截图，实际可见首屏和 Prompt dock。
- Interaction proof：完成分类筛选、选中案例、改写请求主路径。
- Responsive check：至少一个移动视口，确认文字不溢出、底部 Prompt 区不遮挡主流程。
- Network/load check：确认初始只加载 featured 案例，全部案例在首屏图片完成后再预取或加载。

最终 PR 或交付说明必须包含 QA 报告：

- Summary
- Environment
- Changes Verified
- Checks pass/fail 表
- Interaction Loop
- Evidence / screenshots
- Commands / Browser APIs
- Remaining Risk

## 迁移风险

- 本次会移动 `web/` 到 workspace 结构，`package-lock.json`、导入路径、测试路径和启动脚本都会变化。
- 删除 Supabase 和本地 Codex CLI 流程后，旧测试需要删除或重写。
- 如果 Gallery 结构化数据不足，需要在实现计划中明确一次迁移步骤，把 `data/gallery/` 迁移期 Markdown 归档转为结构化数据。
- `data/gallery/` 中的 Markdown 只能作为迁移输入或归档资料；运行时 repository 不能直接解析这些 Markdown。
- Hono 后端需要重新配置 dev proxy、CORS 和 Node 启动脚本。
- 华为云 MaaS 调用需要用 mock 测试覆盖，不能在单元测试中真实消耗线上额度。

## 成功标准

完成后，ImageOdyssey Web App 应成为一个上云友好的 Gallery + Prompt rewrite 工具：

- 前端和后端物理分离。
- 前端不持有服务端密钥或数据库连接信息。
- Gallery 数据通过后端 API 提供。
- 根目录不再包含 `gallery*.md` 和 `index.md`。
- 首屏只加载精选案例，之后渐进加载完整 Gallery。
- Prompt 改写由华为云 MaaS DeepSeek 文本接口完成。
- 改写语义准确服务于 ChatGPT 人物参考图工作流。
- 删除旧图片上传、推荐、视觉理解和实验保存链路。
