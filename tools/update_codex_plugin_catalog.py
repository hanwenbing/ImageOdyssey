#!/usr/bin/env python3
"""Generate a Chinese Codex official plugin catalog from the local marketplace cache."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_MARKETPLACE = Path("/Users/godw/.codex/.tmp/plugins/.agents/plugins/marketplace.json")
DEFAULT_PLUGINS_ROOT = Path("/Users/godw/.codex/.tmp/plugins/plugins")
DEFAULT_DATA = Path("data/codex-plugins/plugins.zh.json")
DEFAULT_OUT = Path("docs/codex-plugins")

CATEGORY_FILE_NAMES = {
    "Coding": "coding.md",
    "Design": "design.md",
    "Lifestyle": "lifestyle.md",
    "Productivity": "productivity.md",
    "Research": "research.md",
}

CATEGORY_ZH = {
    "Coding": "编程与工程",
    "Design": "设计与内容创作",
    "Lifestyle": "生活方式",
    "Productivity": "生产力与业务系统",
    "Research": "研究与数据",
}

AUTH_ZH = {
    "ON_INSTALL": "安装时认证",
    "ON_USE": "使用时认证",
}


@dataclass(frozen=True)
class PluginRecord:
    slug: str
    display_name: str
    category: str
    plugin_type: str
    installation: str
    authentication: str
    summary: str
    use_cases: str
    permission_note: str
    sources: list[str]
    notes: str
    missing_profile: bool


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def title_from_slug(slug: str) -> str:
    known = {
        "atlassian-rovo": "Atlassian Rovo",
        "biorender": "BioRender",
        "build-ios-apps": "Build iOS Apps",
        "build-macos-apps": "Build macOS Apps",
        "cb-insights": "CB Insights",
        "chatgpt-apps": "ChatGPT Apps",
        "coderabbit": "CodeRabbit",
        "dow-jones-factiva": "Dow Jones Factiva",
        "google-calendar": "Google Calendar",
        "google-drive": "Google Drive",
        "help-scout": "Help Scout",
        "highlevel": "HighLevel",
        "hostinger": "Hostinger",
        "hugging-face": "Hugging Face",
        "keybid-puls": "KeyBid Puls",
        "life-science-research": "Life Science Research",
        "marcopolo": "MarcoPolo",
        "monday-com": "Monday.com",
        "moody-s": "Moody's",
        "morningstar": "Morningstar",
        "mt-newswires": "MT Newswires",
        "myregistry-com": "MyRegistry.com",
        "neon-postgres": "Neon Postgres",
        "network-solutions": "Network Solutions",
        "omni-analytics": "Omni Analytics",
        "otter-ai": "Otter.ai",
        "particl-market-research": "Particl Market Research",
        "policynote": "PolicyNote",
        "quicknode": "Quicknode",
        "read-ai": "Read AI",
        "readwise": "Readwise",
        "setu-bharat-connect-billpay": "Setu Bharat Connect BillPay",
        "teamwork-com": "Teamwork.com",
        "third-bridge": "Third Bridge",
        "tinman-ai": "Tinman AI",
        "united-rentals": "United Rentals",
        "weatherpromise": "WeatherPromise",
        "windsor-ai": "Windsor.ai",
        "yepcode": "YepCode",
    }
    if slug in known:
        return known[slug]
    return " ".join(part.capitalize() for part in slug.split("-"))


def detect_plugin_type(plugin_dir: Path) -> str:
    has_app = (plugin_dir / ".app.json").exists()
    has_mcp = (plugin_dir / ".mcp.json").exists()
    has_skills = (plugin_dir / "skills").is_dir()
    kinds: list[str] = []
    if has_app:
        kinds.append("App")
    if has_mcp:
        kinds.append("MCP")
    if has_skills:
        kinds.append("Skill")
    if not kinds:
        return "Plugin"
    if len(kinds) == 1:
        return kinds[0]
    return "Mixed (" + " + ".join(kinds) + ")"


def source_line(sources: list[str]) -> str:
    if not sources:
        return "Codex official marketplace cache"
    return "Codex official marketplace cache；补充来源：" + "、".join(sources)


def build_records(marketplace_path: Path, plugins_root: Path, data_path: Path) -> list[PluginRecord]:
    marketplace = load_json(marketplace_path)
    data = load_json(data_path)
    profiles = data.get("plugins", {})
    category_overrides = data.get("category_overrides", {})

    raw_plugins = marketplace.get("plugins", [])
    slugs = [item["name"] for item in raw_plugins]
    duplicates = [slug for slug, count in Counter(slugs).items() if count > 1]
    if duplicates:
        raise SystemExit(f"Duplicate plugin slugs found: {', '.join(sorted(duplicates))}")

    records: list[PluginRecord] = []
    for item in raw_plugins:
        slug = item["name"]
        policy = item.get("policy", {})
        profile = profiles.get(slug, {})
        category = item.get("category") or category_overrides.get(slug)
        if not category:
            raise SystemExit(f"Missing category for {slug}; add it to category_overrides")
        if category not in CATEGORY_FILE_NAMES:
            raise SystemExit(f"Unknown category {category!r} for {slug}")

        display_name = profile.get("display_name") or title_from_slug(slug)
        summary = profile.get("summary") or "待补充：本地官方缓存只确认该插件存在，尚未补充可靠中文介绍。"
        use_cases = profile.get("use_cases") or "待补充：需要结合官方连接说明或厂商资料确认适合场景。"
        permission_note = profile.get("permission_note") or "具体可用动作、读写权限和授权范围以 ChatGPT 工作区 Apps 管理页及安装授权页为准。"
        sources = profile.get("sources", [])
        notes = profile.get("notes", "")

        records.append(
            PluginRecord(
                slug=slug,
                display_name=display_name,
                category=category,
                plugin_type=detect_plugin_type(plugins_root / slug),
                installation=policy.get("installation", "AVAILABLE"),
                authentication=policy.get("authentication", "ON_INSTALL"),
                summary=summary,
                use_cases=use_cases,
                permission_note=permission_note,
                sources=sources,
                notes=notes,
                missing_profile=slug not in profiles,
            )
        )
    return sorted(records, key=lambda r: (r.category, r.display_name.lower()))


def render_index(records: list[PluginRecord], marketplace_path: Path, generated_at: str) -> str:
    by_category: dict[str, list[PluginRecord]] = defaultdict(list)
    for record in records:
        by_category[record.category].append(record)

    lines = [
        "# Codex 官方插件清单",
        "",
        f"> 生成时间：{generated_at}",
        f"> 来源：`{marketplace_path}`（本机 `openai-curated / Codex official` marketplace 缓存）",
        "",
        "## 口径",
        "",
        "- 本清单第一版只收录本机 Codex official marketplace 缓存中的插件。",
        "- 截图用于校验可见插件、分类和短描述；网络资料只用于补充说明，不把未进入本机官方缓存的插件纳入清单。",
        "- 单个插件的可用动作、读写范围、计划限制和地区限制可能变化，最终以 Codex/ChatGPT 安装页和工作区 Apps 管理页为准。",
        "",
        "## 官方参考",
        "",
        "- [Plugins and skills | OpenAI Academy](https://openai.com/academy/codex-plugins-and-skills/)",
        "- [Using Codex with your ChatGPT plan | OpenAI Help Center](https://help.openai.com/en/articles/11369540-codex-in-chatgpt)",
        "- [ChatGPT Enterprise & Edu release notes: Plugins in Codex](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-edu-release-notes)",
        "",
        "## 分类索引",
        "",
    ]

    total = 0
    for category in CATEGORY_FILE_NAMES:
        category_records = by_category.get(category, [])
        total += len(category_records)
        lines.append(f"- [{CATEGORY_ZH[category]}（{category}）](./{CATEGORY_FILE_NAMES[category]})：{len(category_records)} 个")
    lines.extend(["", f"合计：{total} 个插件。", "", "## 维护方式", "", "在仓库根目录运行：", "", "```bash", "python3 tools/update_codex_plugin_catalog.py", "```", "", "只检查来源和数据完整性，不写文件：", "", "```bash", "python3 tools/update_codex_plugin_catalog.py --check", "```", ""])
    return "\n".join(lines)


def render_category(category: str, records: list[PluginRecord], generated_at: str) -> str:
    category_records = [record for record in records if record.category == category]
    lines = [
        f"# {CATEGORY_ZH[category]}（{category}）",
        "",
        f"> 生成时间：{generated_at}",
        f"> 插件数量：{len(category_records)}",
        "",
    ]
    for record in sorted(category_records, key=lambda r: r.display_name.lower()):
        auth = AUTH_ZH.get(record.authentication, record.authentication)
        lines.extend(
            [
                f"## {record.display_name}",
                "",
                f"- 类别：{record.category}",
                f"- 类型：{record.plugin_type}",
                f"- 简介：{record.summary}",
                f"- 适合：{record.use_cases}",
                f"- 连接与权限：{auth}；{record.permission_note}",
                f"- 来源：{source_line(record.sources)}",
            ]
        )
        if record.notes:
            lines.append(f"- 备注：{record.notes}")
        lines.append("")
    return "\n".join(lines)


def check_records(records: list[PluginRecord]) -> tuple[list[str], list[str]]:
    messages: list[str] = []
    warnings: list[str] = []
    categories = {record.category for record in records}
    missing_categories = set(CATEGORY_FILE_NAMES) - categories
    if missing_categories:
        messages.append("Missing categories: " + ", ".join(sorted(missing_categories)))
    missing_profiles = [record.slug for record in records if record.missing_profile]
    if missing_profiles:
        warnings.append("Missing zh profiles: " + ", ".join(missing_profiles))
    return messages, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--marketplace", type=Path, default=DEFAULT_MARKETPLACE)
    parser.add_argument("--plugins-root", type=Path, default=DEFAULT_PLUGINS_ROOT)
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--check", action="store_true", help="Validate inputs without writing markdown files.")
    args = parser.parse_args()

    records = build_records(args.marketplace, args.plugins_root, args.data)
    messages, warnings = check_records(records)
    counts = Counter(record.category for record in records)

    print(f"Marketplace: {args.marketplace}")
    print(f"Plugins: {len(records)}")
    for category in CATEGORY_FILE_NAMES:
        print(f"- {category}: {counts[category]}")

    if messages:
        for message in messages:
            print(f"ERROR: {message}")
        return 1
    for warning in warnings:
        print(f"WARNING: {warning}")

    if args.check:
        print("Check passed.")
        return 0

    generated_at = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    write_text(args.out / "index.md", render_index(records, args.marketplace, generated_at))
    for category, filename in CATEGORY_FILE_NAMES.items():
        write_text(args.out / filename, render_category(category, records, generated_at))

    print(f"Wrote catalog to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
