<template>
  <div class="app-shell">
    <header class="hero">
      <nav class="nav-bar" aria-label="主导航">
        <a class="brand" href="#top" aria-label="Minecraft Wiki API 首页">
          <span class="brand-mark">⛏</span>
          <span>Minecraft Wiki API</span>
        </a>
        <div class="nav-actions">
          <a href="/api" target="_blank" rel="noreferrer">API 信息</a>
          <a href="/health" target="_blank" rel="noreferrer">健康检查</a>
          <a href="https://github.com/rice-awa/minecraft-wiki-fetch-api" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </nav>

      <section id="top" class="hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">面向 Minecraft 中文 Wiki 的内容获取服务</p>
          <h1>用一个更稳定、更现代的控制台调试 Wiki API</h1>
          <p class="hero-description">
            搜索条目、抓取页面内容、检查服务状态，并快速复制常用请求。前端由 Vue + Vite 构建，静态资源与 Serverless API 在 Vercel 上分离部署。
          </p>
          <div class="hero-actions">
            <a class="button primary" href="#playground">开始调试</a>
            <a class="button ghost" href="/api" target="_blank" rel="noreferrer">查看端点</a>
          </div>
        </div>

        <aside class="status-card" aria-live="polite">
          <div class="status-card__header">
            <span :class="['pulse', healthState]" aria-hidden="true"></span>
            <span>服务状态</span>
          </div>
          <strong>{{ healthLabel }}</strong>
          <p>{{ healthMessage }}</p>
          <button class="link-button" type="button" :disabled="loading.health" @click="checkHealth">
            {{ loading.health ? '检查中…' : '重新检查' }}
          </button>
        </aside>
      </section>
    </header>

    <main>
      <section class="section stats-section" aria-label="能力概览">
        <article v-for="item in highlights" :key="item.title" class="metric-card">
          <span class="metric-icon">{{ item.icon }}</span>
          <h2>{{ item.title }}</h2>
          <p>{{ item.description }}</p>
        </article>
      </section>

      <section id="playground" class="section playground">
        <div class="section-heading">
          <p class="eyebrow">Playground</p>
          <h2>在线调试控制台</h2>
          <p>选择一个操作，填写参数后直接调用当前部署环境下的 API。</p>
        </div>

        <div class="tabs" role="tablist" aria-label="API 操作类型">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="['tab-button', { active: activeTab === tab.id }]"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="console-card">
          <form v-if="activeTab === 'search'" class="form-grid" @submit.prevent="runSearch">
            <label>
              搜索关键词
              <input v-model.trim="searchForm.q" type="text" placeholder="例如：钻石" required />
            </label>
            <label>
              结果数量
              <input v-model.number="searchForm.limit" type="number" min="1" max="50" />
            </label>
            <label class="checkbox-label">
              <input v-model="searchForm.pretty" type="checkbox" />
              返回格式化 JSON
            </label>
            <button class="button primary" type="submit" :disabled="loading.request">
              {{ loading.request ? '请求中…' : '搜索 Wiki' }}
            </button>
          </form>

          <form v-else-if="activeTab === 'page'" class="form-grid" @submit.prevent="fetchPage">
            <label>
              页面名称
              <input v-model.trim="pageForm.name" type="text" placeholder="例如：钻石" required />
            </label>
            <label>
              输出格式
              <select v-model="pageForm.format">
                <option value="both">HTML + Markdown</option>
                <option value="markdown">Markdown</option>
                <option value="html">HTML</option>
                <option value="wikitext">Wikitext</option>
              </select>
            </label>
            <label class="checkbox-label">
              <input v-model="pageForm.pretty" type="checkbox" />
              返回格式化 JSON
            </label>
            <button class="button primary" type="submit" :disabled="loading.request">
              {{ loading.request ? '请求中…' : '获取页面' }}
            </button>
          </form>

          <form v-else class="form-grid" @submit.prevent="runBatch">
            <label class="span-2">
              页面列表（每行一个）
              <textarea v-model="batchForm.pages" rows="5" placeholder="钻石&#10;铁锭&#10;红石"></textarea>
            </label>
            <label>
              输出格式
              <select v-model="batchForm.format">
                <option value="markdown">Markdown</option>
                <option value="both">HTML + Markdown</option>
                <option value="html">HTML</option>
                <option value="wikitext">Wikitext</option>
              </select>
            </label>
            <label>
              API Key（如已启用保护）
              <input v-model.trim="batchForm.apiKey" type="password" autocomplete="off" placeholder="X-API-Key" />
            </label>
            <button class="button primary" type="submit" :disabled="loading.request">
              {{ loading.request ? '请求中…' : '批量获取' }}
            </button>
          </form>

          <div class="request-preview">
            <span>当前请求</span>
            <code>{{ requestPreview }}</code>
          </div>

          <div class="result-panel">
            <div class="result-panel__header">
              <span>响应结果</span>
              <button class="link-button" type="button" :disabled="!resultText" @click="copyResult">复制结果</button>
            </div>
            <pre><code>{{ resultText || '提交上方表单后，响应会显示在这里。' }}</code></pre>
          </div>
        </div>
      </section>

      <section class="section endpoints-section">
        <div class="section-heading">
          <p class="eyebrow">Endpoints</p>
          <h2>常用端点</h2>
        </div>
        <div class="endpoint-grid">
          <article v-for="endpoint in endpoints" :key="endpoint.path" class="endpoint-card">
            <span class="method">{{ endpoint.method }}</span>
            <code>{{ endpoint.path }}</code>
            <p>{{ endpoint.description }}</p>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';

const tabs = [
  { id: 'search', label: '搜索' },
  { id: 'page', label: '单页获取' },
  { id: 'batch', label: '批量获取' },
];

const highlights = [
  { icon: '🔎', title: '搜索条目', description: '通过关键词搜索中文 Minecraft Wiki，并限制返回数量。' },
  { icon: '📄', title: '页面解析', description: '获取 HTML、Markdown、Wikitext 或组合格式内容。' },
  { icon: '🧰', title: 'Vercel 友好', description: '前端静态构建，API 保持 Serverless 函数部署。' },
];

const endpoints = [
  { method: 'GET', path: '/api/search?q=钻石&limit=5', description: '搜索 Wiki 页面。' },
  { method: 'GET', path: '/api/page/钻石?format=markdown', description: '获取单个页面内容。' },
  { method: 'POST', path: '/api/pages', description: '批量获取多个页面，可配合 API Key。' },
  { method: 'GET', path: '/health/detailed', description: '查看服务详细健康状态。' },
];

const activeTab = ref('search');
const healthState = ref('pending');
const healthMessage = ref('尚未检查服务状态。');
const result = ref(null);
const loading = reactive({ health: false, request: false });

const searchForm = reactive({ q: '钻石', limit: 5, pretty: true });
const pageForm = reactive({ name: '钻石', format: 'markdown', pretty: true });
const batchForm = reactive({ pages: '钻石\n铁锭', format: 'markdown', apiKey: '' });

const healthLabel = computed(() => {
  if (healthState.value === 'healthy') return '运行正常';
  if (healthState.value === 'error') return '检查失败';
  return '等待检查';
});

const requestPreview = computed(() => {
  if (activeTab.value === 'search') {
    const params = new URLSearchParams({ q: searchForm.q || '关键词', limit: String(searchForm.limit || 10) });
    if (searchForm.pretty) params.set('pretty', 'true');
    return `GET /api/search?${params.toString()}`;
  }

  if (activeTab.value === 'page') {
    const params = new URLSearchParams({ format: pageForm.format });
    if (pageForm.pretty) params.set('pretty', 'true');
    return `GET /api/page/${encodeURIComponent(pageForm.name || '页面名称')}?${params.toString()}`;
  }

  return 'POST /api/pages';
});

const resultText = computed(() => {
  if (!result.value) return '';
  return typeof result.value === 'string' ? result.value : JSON.stringify(result.value, null, 2);
});

async function checkHealth() {
  loading.health = true;
  try {
    const data = await requestJson('/health');
    healthState.value = 'healthy';
    healthMessage.value = `最后检查：${new Date().toLocaleString()}，状态：${data.status || 'healthy'}`;
  } catch (error) {
    healthState.value = 'error';
    healthMessage.value = error.message;
  } finally {
    loading.health = false;
  }
}

async function runSearch() {
  const params = new URLSearchParams({ q: searchForm.q, limit: String(searchForm.limit || 10) });
  if (searchForm.pretty) params.set('pretty', 'true');
  await executeRequest(`/api/search?${params.toString()}`);
}

async function fetchPage() {
  const params = new URLSearchParams({ format: pageForm.format });
  if (pageForm.pretty) params.set('pretty', 'true');
  await executeRequest(`/api/page/${encodeURIComponent(pageForm.name)}?${params.toString()}`);
}

async function runBatch() {
  const pages = batchForm.pages
    .split('\n')
    .map((page) => page.trim())
    .filter(Boolean);

  await executeRequest('/api/pages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(batchForm.apiKey ? { 'X-API-Key': batchForm.apiKey } : {}),
    },
    body: JSON.stringify({ pages, format: batchForm.format, concurrency: 2 }),
  });
}

async function executeRequest(url, options) {
  loading.request = true;
  result.value = null;
  try {
    result.value = await requestJson(url, options);
  } catch (error) {
    result.value = { error: error.message };
  } finally {
    loading.request = false;
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload.message || payload.error || response.statusText;
    throw new Error(`${response.status} ${message}`);
  }

  return payload;
}

async function copyResult() {
  if (!resultText.value) return;
  await navigator.clipboard.writeText(resultText.value);
}

onMounted(checkHealth);
</script>
