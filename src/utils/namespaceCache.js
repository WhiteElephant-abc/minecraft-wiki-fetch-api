/**
 * 命名空间映射缓存，从 zh.minecraft.wiki 实时拉取，每小时刷新。
 */

const WIKI_API = 'https://zh.minecraft.wiki/api.php?action=query&meta=siteinfo&siprop=namespaces&format=json';
const TTL = 3600000; // 1小时

let cache = null;
let cacheTime = 0;
let cacheFailTime = 0;

async function fetchNamespaces() {
    const now = Date.now();
    if (cache && now - cacheTime < TTL) return cache;
    if (!cache && cacheFailTime && now - cacheFailTime < 30000) return {};

    try {
        const { HttpClient } = require('./httpClient');
        const client = new HttpClient({ timeout: 15000 });
        const resp = await client.get(WIKI_API);
        const ns = resp.data.query.namespaces;
        const mapping = {};
        for (const [id, info] of Object.entries(ns)) {
            const name = info['*'] || info.canonical || (id === '0' ? 'Main' : '');
            if (name) mapping[id] = name;
        }
        cache = mapping;
        cacheTime = now;
        return mapping;
    } catch {
        cacheFailTime = now;
        return {};
    }
}

module.exports = { fetchNamespaces };
