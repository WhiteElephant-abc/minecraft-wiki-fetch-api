"""Minecraft Wiki MCP Server — 提供搜索和页面抓取工具"""

import os
import httpx
from mcp.server.fastmcp import FastMCP

API_BASE = os.getenv("API_BASE_URL", "http://localhost:3000")

mcp = FastMCP("Minecraft Wiki", host="0.0.0.0", port=3001)


@mcp.tool()
async def search_wiki(
    q: str,
    limit: int = 10,
) -> str:
    """搜索 Minecraft 中文 Wiki。

    根据关键词查找匹配的 Wiki 页面，返回标题、URL 和摘要。
    当你需要了解某个游戏概念、物品、机制时使用此工具。

    Args:
        q: 搜索关键词，支持中文。例如 "钻石"、"红石"、"命令"
        limit: 返回结果数量，默认 10，最大 50
    """
    async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
        resp = await client.get(
            f"{API_BASE}/api/search",
            params={"q": q, "limit": min(limit, 50)},
        )
        resp.raise_for_status()
        data = resp.json()

    if not data.get("success"):
        return f"搜索失败: {data.get('error', {}).get('message', '未知错误')}"

    results = data["data"]["results"]
    if not results:
        return f"未找到与 '{q}' 相关的页面。"

    lines = [f"搜索 '{q}' 的结果 ({len(results)} 条):\n"]
    for r in results:
        snippet = r["snippet"].replace("\n", " ")[:150]
        lines.append(f"- **{r['title']}** ({r['namespace']})")
        lines.append(f"  {r['url']}")
        lines.append(f"  {snippet}")
        lines.append("")
    return "\n".join(lines)


@mcp.tool()
async def get_page(
    pageName: str,
    format: str = "wikitext",
) -> str:
    """获取 Minecraft 中文 Wiki 页面的内容。

    根据页面名称获取 Wiki 页面的完整内容，支持三种格式。

    格式选择建议：
    - **wikitext（默认，推荐）**：最完整的格式，包含 Wiki 原始标记语言。
      所有信息框、历史表格、配方等模板数据均以 {{Template}} 形式完整保留。
      绝大多数情况下应优先使用 wikitext。
    - **markdown**：将 HTML 转换为 Markdown 后返回，适合需要易读格式的场景。
      部分复杂模板（如历史表格）可能被简化或丢失。
    - **html**：清洗后的正文 HTML，去除了导航、编辑链接等噪音。
      **仅在 wikitext 中的某个模板语法无法理解、需要查看渲染后结构时使用。**
      非必要不用 html，数据完整度不如 wikitext。

    Args:
        pageName: 页面名称，支持中文。例如 "钻石"、"工作台"、"命令"
        format: 输出格式：wikitext（默认）、markdown、html
    """
    valid_formats = ("wikitext", "markdown", "html")
    if format not in valid_formats:
        return f"无效的 format: {format}，可选值: {', '.join(valid_formats)}"

    async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
        resp = await client.get(
            f"{API_BASE}/api/page/{pageName}",
            params={"format": format},
        )
        resp.raise_for_status()
        data = resp.json()

    if not data.get("success"):
        error = data.get("error", {})
        code = error.get("code", "")
        if code == "PAGE_NOT_FOUND":
            return f"页面 '{pageName}' 不存在。可尝试使用 search_wiki 搜索正确的页面名称。"
        return f"获取页面失败: {error.get('message', '未知错误')}"

    page = data["data"]["page"]

    if format == "wikitext":
        content = page["content"]["wikitext"]
    elif format == "markdown":
        content = page["content"]["markdown"]
    elif format == "html":
        content = page["content"]["html"]

    meta = page.get("meta", {})
    info_lines = [
        f"# {page['pageName']}",
        f"URL: {page['url']}",
        f"格式: {format}  |  字数: {meta.get('wordCount', 'N/A')}",
        "",
        content,
    ]
    return "\n".join(info_lines)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
