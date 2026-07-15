/**
 * Search URL Builder for Minecraft Wiki
 * Handles URL construction for wiki search with proper encoding
 */

class SearchUrlBuilder {
    constructor(baseUrl = 'https://zh.minecraft.wiki') {
        this.baseUrl = baseUrl;
        this.searchPath = '/';
    }

    /**
     * Build search URL with proper encoding for Chinese keywords (matches MC Wiki format)
     * @param {string} keyword - Search keyword
     * @param {Object} options - Search options
     * @param {number} options.limit - Maximum number of results (default: 10)
     * @param {Array<string>} options.namespaces - Array of namespace IDs (default: [])
     * @param {string} options.profile - Search profile (default: 'advanced')
     * @param {boolean} options.fulltext - Enable fulltext search (default: true)
     * @param {boolean} options.includeSearchToken - Include searchToken parameter (default: false)
     * @returns {string} Complete search URL
     */
    buildSearchUrl(keyword, options = {}) {
        if (!keyword || typeof keyword !== 'string' || keyword.trim() === '') {
            throw new Error('Keyword must be a non-empty string');
        }

        const {
            limit = 10,
            namespaces = [],
            profile = 'advanced',
            fulltext = true,
            includeSearchToken = false
        } = options;

        // Validate parameters
        if (limit < 1 || limit > 500) {
            throw new Error('Limit must be between 1 and 500');
        }

        const searchParams = new URLSearchParams({
            search: keyword.trim(),
            title: 'Special:Search',
            profile: profile,
            fulltext: fulltext ? '1' : '0',
            limit: limit.toString()
        });

        // Add namespace parameters in MC Wiki format (ns0=1, ns9994=1, etc.)
        namespaces.forEach(ns => {
            searchParams.set(`ns${ns}`, '1');
        });

        // Add searchToken only if requested (optional for functionality)
        if (includeSearchToken) {
            searchParams.set('searchToken', this.generateSearchToken());
        }

        return `${this.baseUrl}${this.searchPath}?${searchParams.toString()}`;
    }

    /**
     * Build search URL for specific namespaces (deprecated - use buildSearchUrl with namespaces option)
     * @param {string} keyword - Search keyword
     * @param {Array<string>} namespaces - Array of namespace IDs
     * @param {Object} options - Additional options
     * @returns {string} Complete search URL
     */
    buildNamespaceSearchUrl(keyword, namespaces = ['0'], options = {}) {
        return this.buildSearchUrl(keyword, { ...options, namespaces });
    }

    /**
     * Generate a search token (simplified version)
     * @returns {string} Random search token
     */
    generateSearchToken() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    /**
     * Build page URL for MC Wiki
     * @param {string} pageName - Page name
     * @returns {string} Complete page URL
     */
    buildPageUrl(pageName) {
        if (!pageName || typeof pageName !== 'string' || pageName.trim() === '') {
            throw new Error('Page name must be a non-empty string');
        }
        
        return `${this.baseUrl}/w/${encodeURIComponent(pageName.trim())}`;
    }

    /**
     * 从 mcwiki 官方搜索配置提取的默认命名空间。
     * 来源：Special:Search 页面取消勾选 Main 后显示的默认勾选项。
     * @returns {Array<string>}
     */
    getDefaultNamespaces() {
        return ['0', '4', '10', '12', '9998', '10014'];
        //         Main  ^MCWiki^Templ^Help ^Tutorial^Dungeons II
    }

    /**
     * Validate and normalize search keyword
     * @param {string} keyword - Raw keyword
     * @returns {string} Normalized keyword
     */
    normalizeKeyword(keyword) {
        if (!keyword || typeof keyword !== 'string' || keyword.trim() === '') {
            throw new Error('Keyword must be a non-empty string');
        }

        return keyword.trim().replace(/\s+/g, ' ');
    }
}

module.exports = SearchUrlBuilder;