/**
 * Search API Routes
 * 定义搜索相关的API路由
 */

const express = require('express');
const SearchController = require('../controllers/searchController');

const router = express.Router();
const searchController = new SearchController();

/**
 * GET /api/search
 * 搜索Wiki内容
 * 
 * 查询参数:
 * - q: 搜索关键词 (必需)
 * - limit: 结果数量限制 (可选, 默认10, 最大50)
 * - namespaces: 命名空间 (可选, 默认主命名空间)
 * - format: 响应格式 (可选, 默认json)
 * 
 * 示例:
 * GET /api/search?q=钻石&limit=5
 * GET /api/search?q=redstone&namespaces=0,14&limit=10
 */
router.get('/', async (req, res) => {
    await searchController.search(req, res);
});

/**
 * GET /api/search/stats
 * 获取搜索服务统计信息
 */
router.get('/stats', async (req, res) => {
    await searchController.getStats(req, res);
});

module.exports = router;