# Codex 官方插件清单

> 生成时间：2026-04-30 10:02:46 CST
> 来源：`/Users/godw/.codex/.tmp/plugins/.agents/plugins/marketplace.json`（本机 `openai-curated / Codex official` marketplace 缓存）

## 口径

- 本清单第一版只收录本机 Codex official marketplace 缓存中的插件。
- 截图用于校验可见插件、分类和短描述；网络资料只用于补充说明，不把未进入本机官方缓存的插件纳入清单。
- 单个插件的可用动作、读写范围、计划限制和地区限制可能变化，最终以 Codex/ChatGPT 安装页和工作区 Apps 管理页为准。

## 官方参考

- [Plugins and skills | OpenAI Academy](https://openai.com/academy/codex-plugins-and-skills/)
- [Using Codex with your ChatGPT plan | OpenAI Help Center](https://help.openai.com/en/articles/11369540-codex-in-chatgpt)
- [ChatGPT Enterprise & Edu release notes: Plugins in Codex](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-edu-release-notes)

## 分类索引

- [编程与工程（Coding）](./coding.md)：29 个
- [设计与内容创作（Design）](./design.md)：5 个
- [生活方式（Lifestyle）](./lifestyle.md)：5 个
- [生产力与业务系统（Productivity）](./productivity.md)：59 个
- [研究与数据（Research）](./research.md)：20 个

合计：118 个插件。

## 维护方式

在仓库根目录运行：

```bash
python3 tools/update_codex_plugin_catalog.py
```

只检查来源和数据完整性，不写文件：

```bash
python3 tools/update_codex_plugin_catalog.py --check
```
