/**
 * Page Content Parser for Minecraft Wiki
 * 使用Cheerio解析Wiki页面HTML结构，提取和清理页面内容
 */

const cheerio = require('cheerio');
const { logger } = require('../utils/logger');

class PageContentParser {
    constructor(options = {}) {
        // 解析配置
        this.options = {
            // 主要内容选择器
            contentSelector: '#mw-content-text .mw-parser-output',
            
            // 要移除的元素选择器
            removeSelectors: [
                '.mw-editsection',           // 编辑链接
                '.navbox',                   // 导航框
                '.metadata',                 // 元数据
                '.stub',                     // 小作品标记
                '.ambox',                    // 消息框（部分）
                '.hatnote',                  // 消歧义链接
                '.mw-jump-link',            // 跳转链接
                '.printfooter',             // 打印页脚
                '.catlinks',                // 分类链接
                '#toc + .mw-empty-elt',     // 目录后的空元素
                'script',                   // 脚本
                'style',                    // 样式
                '.reference .mw-reflink-text', // 参考文献链接文本
                '.mw-cite-backlink'         // 引用回链
            ],

            // 要保留的特殊元素选择器
            preserveSelectors: [
                '.infobox',                 // 信息框
                '.thumbinner',              // 图片容器
                '.gallery',                 // 图片画廊
                '#toc',                     // 目录
                '.wikitable',               // Wiki表格
                '.mw-highlight'             // 代码高亮
            ],

            // 图片处理
            imageOptions: {
                convertToAbsolute: true,    // 转换为绝对URL
                removeSmallImages: true,    // 移除小尺寸图片
                minWidth: 50,              // 最小宽度
                minHeight: 50              // 最小高度
            },

            // 链接处理
            linkOptions: {
                convertInternalLinks: true, // 转换内部链接
                preserveExternalLinks: true, // 保留外部链接
                baseUrl: 'https://zh.minecraft.wiki'
            },

            ...options
        };
    }

    /**
     * 解析Wiki页面HTML内容
     * @param {string} html - 原始HTML内容
     * @param {Object} pageInfo - 页面信息
     * @returns {Object} 解析后的页面内容
     */
    parsePageContent(html, pageInfo = {}) {
        try {
            if (!html || typeof html !== 'string') {
                throw new Error('HTML内容必须是非空字符串');
            }

            const $ = cheerio.load(html);
            
            // 检查是否是有效的Wiki页面
            if (!this._isValidWikiPage($)) {
                throw new Error('不是有效的Wiki页面HTML');
            }

            // 提取页面基本信息
            const basicInfo = this._extractBasicInfo($, pageInfo);

            // 提取主要内容区域
            const $content = this._extractMainContent($);

            if ($content.length === 0) {
                throw new Error('找不到主要内容区域');
            }

            // 清理和处理内容
            this._cleanContent($content);
            this._processImages($content);
            this._processLinks($content);
            this._processTables($content);

            // 提取内容组件
            const components = this._extractContentComponents($content);

            // 生成清理后的HTML
            const cleanHtml = $content.html();

            // 提取纯文本内容
            const textContent = this._extractTextContent($content);

            return {
                success: true,
                data: {
                    ...basicInfo,
                    content: {
                        html: cleanHtml,
                        text: textContent,
                        components
                    },
                    meta: {
                        wordCount: this._countWords(textContent),
                        imageCount: components.images.length,
                        tableCount: components.tables.length,
                        sectionCount: components.sections.length,
                        processingTime: Date.now()
                    }
                }
            };

        } catch (error) {
            logger.error('页面内容解析失败', { error: error.message, pageInfo });
            
            return {
                success: false,
                error: {
                    code: 'PARSE_ERROR',
                    message: error.message,
                    details: null
                },
                data: null
            };
        }
    }

    /**
     * 检查是否是有效的Wiki页面
     * @private
     */
    _isValidWikiPage($) {
        // 检查关键的Wiki页面元素
        const indicators = [
            '#mw-content-text',
            '.mw-parser-output',
            '#firstHeading',
            '#mw-head'
        ];

        return indicators.some(selector => $(selector).length > 0);
    }

    /**
     * 提取页面基本信息
     * @private
     */
    _extractBasicInfo($, pageInfo) {
        const title = $('#firstHeading').text().trim() || pageInfo.title || '';
        const subtitle = $('#contentSub').text().trim() || '';
        
        // 提取页面分类
        const categories = [];
        $('#mw-normal-catlinks a[title]').each((i, el) => {
            const categoryName = $(el).text().trim();
            const categoryUrl = $(el).attr('href');
            if (categoryName) {
                categories.push({
                    name: categoryName,
                    url: this._normalizeUrl(categoryUrl)
                });
            }
        });

        // 提取页面语言链接
        const languages = [];
        $('#p-lang a').each((i, el) => {
            const langName = $(el).text().trim();
            const langUrl = $(el).attr('href');
            const langCode = $(el).attr('hreflang');
            if (langName && langUrl) {
                languages.push({
                    name: langName,
                    code: langCode,
                    url: langUrl
                });
            }
        });

        return {
            title,
            subtitle,
            categories,
            languages,
            namespace: pageInfo.namespace || '',
            lastModified: this._extractLastModified($)
        };
    }

    /**
     * 提取主要内容区域
     * @private
     */
    _extractMainContent($) {
        const $content = $(this.options.contentSelector);
        
        if ($content.length === 0) {
            // 如果找不到标准选择器，尝试备用选择器
            const fallbackSelectors = [
                '#mw-content-text',
                '.mw-body-content',
                '#content .mw-content-ltr'
            ];
            
            for (const selector of fallbackSelectors) {
                const $fallback = $(selector);
                if ($fallback.length > 0) {
                    return $fallback;
                }
            }
        }
        
        return $content;
    }

    /**
     * 清理内容，移除不需要的元素
     * @private
     */
    _cleanContent($content) {
        // 移除不需要的元素
        this.options.removeSelectors.forEach(selector => {
            $content.find(selector).remove();
        });

        // 简化清理逻辑，只移除明显的空元素
        $content.find('p:empty, div:empty, span:empty').remove();

        // 清理连续的空白
        const cleaned = $content.html();
        if (cleaned) {
            $content.html(cleaned.replace(/\n\s*\n\s*\n/g, '\n\n'));
        }
    }

    /**
     * 处理图片
     * @private
     */
    _processImages($content) {
        const { imageOptions } = this.options;
        const $ = cheerio.load($content.html());
        
        $('img').each((i, el) => {
            const $img = $(el);
            let src = $img.attr('src');
            
            if (!src) return;

            // 转换为绝对URL
            if (imageOptions.convertToAbsolute && src.startsWith('/')) {
                src = this.options.linkOptions.baseUrl + src;
                $img.attr('src', src);
            }

            // 移除小尺寸图片
            if (imageOptions.removeSmallImages) {
                const width = parseInt($img.attr('width')) || 0;
                const height = parseInt($img.attr('height')) || 0;
                
                if ((width > 0 && width < imageOptions.minWidth) || 
                    (height > 0 && height < imageOptions.minHeight)) {
                    $img.closest('.thumb, .thumbinner, figure').remove();
                    return;
                }
            }

            // 添加alt属性（如果没有）
            if (!$img.attr('alt')) {
                const caption = $img.closest('.thumbinner').find('.thumbcaption').text().trim();
                if (caption) {
                    $img.attr('alt', caption);
                }
            }
        });

        $content.html($.html());
    }

    /**
     * 处理链接
     * @private  
     */
    _processLinks($content) {
        const { linkOptions } = this.options;
        const $ = cheerio.load($content.html());
        
        $('a[href]').each((i, el) => {
            const $link = $(el);
            let href = $link.attr('href');
            
            if (!href) return;

            // 处理内部链接
            if (linkOptions.convertInternalLinks && href.startsWith('/')) {
                href = linkOptions.baseUrl + href;
                $link.attr('href', href);
            }

            // 移除编辑链接和其他不需要的链接
            if (href.includes('action=edit') || 
                href.includes('redlink=1') ||
                $link.hasClass('mw-selflink')) {
                $link.replaceWith($link.text());
            }
        });

        $content.html($.html());
    }

    /**
     * 处理表格
     * @private
     */
    _processTables($content) {
        const $ = cheerio.load($content.html());
        
        $('table').each((i, el) => {
            const $table = $(el);
            
            // 为表格添加响应式类
            if (!$table.hasClass('wikitable')) {
                $table.addClass('wikitable');
            }
            
            // 清理表格样式
            $table.removeAttr('style border cellpadding cellspacing');
            $table.find('*').removeAttr('style');
        });

        $content.html($.html());
    }

    /**
     * 提取内容组件
     * @private
     */
    _extractContentComponents($content) {
        const components = {
            sections: [],
            images: [],
            tables: [],
            infoboxes: [],
            toc: null
        };

        const $ = cheerio.load($content.html());

        // 提取章节
        $('h1, h2, h3, h4, h5, h6').each((i, el) => {
            const $heading = $(el);
            const level = parseInt($heading.prop('tagName').substring(1));
            const text = $heading.text().trim();
            const id = $heading.attr('id') || '';
            
            if (text) {
                components.sections.push({
                    level,
                    text,
                    id,
                    anchor: id ? `#${id}` : ''
                });
            }
        });

        // 提取图片
        $('img').each((i, el) => {
            const $img = $(el);
            const src = $img.attr('src');
            const alt = $img.attr('alt') || '';
            const caption = $img.closest('.thumbinner').find('.thumbcaption').text().trim();
            
            if (src) {
                components.images.push({
                    src,
                    alt,
                    caption,
                    width: $img.attr('width'),
                    height: $img.attr('height')
                });
            }
        });

        // 提取表格
        $('table').each((i, el) => {
            const $table = $(el);
            const caption = $table.find('caption').text().trim();
            const rowCount = $table.find('tr').length;
            const colCount = $table.find('tr').first().find('th, td').length;
            
            components.tables.push({
                caption,
                rowCount,
                colCount,
                hasHeader: $table.find('th').length > 0
            });
        });

        // 提取信息框
        $('.infobox').each((i, el) => {
            const $infobox = $(el);
            const title = $infobox.find('.infobox-title, .fn').first().text().trim();
            const type = $infobox.attr('class').split(' ').find(cls => cls.includes('infobox')) || 'infobox';
            
            components.infoboxes.push({
                title,
                type,
                hasImage: $infobox.find('img').length > 0
            });
        });

        // 提取目录
        const $toc = $('#toc, .toc');
        if ($toc.length > 0) {
            const tocItems = [];
            $toc.find('a').each((i, el) => {
                const $link = $(el);
                const text = $link.text().trim();
                const href = $link.attr('href');
                if (text && href) {
                    tocItems.push({ text, href });
                }
            });
            components.toc = { items: tocItems };
        }

        return components;
    }

    /**
     * 提取纯文本内容
     * @private
     */
    _extractTextContent($content) {
        // 创建内容副本用于文本提取
        const $ = cheerio.load($content.html());
        
        // 移除不需要的元素
        $('script, style, .infobox, #toc, .navbox').remove();
        
        // 获取纯文本并清理
        let text = $.text();
        
        // 清理多余的空白
        text = text.replace(/\s+/g, ' ').trim();
        
        // 移除重复的换行
        text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
        
        return text;
    }

    /**
     * 检查是否是需要保留的元素
     * @private
     */
    _isPreservedElement($el) {
        return this.options.preserveSelectors.some(selector => {
            try {
                return $el.is && $el.is(selector);
            } catch {
                return false;
            }
        });
    }

    /**
     * 规范化URL
     * @private
     */
    _normalizeUrl(url) {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        if (url.startsWith('/')) return this.options.linkOptions.baseUrl + url;
        return url;
    }

    /**
     * 提取最后修改时间
     * @private
     */
    _extractLastModified($) {
        const lastModText = $('#footer-info-lastmod').text();
        if (lastModText) {
            const match = lastModText.match(/(\d{4}年\d{1,2}月\d{1,2}日)/);
            return match ? match[1] : null;
        }
        return null;
    }

    /**
     * 统计词数
     * @private
     */
    _countWords(text) {
        if (!text) return 0;
        
        // 对于中文，按字符计数；对于英文，按单词计数
        const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
        const englishWords = text.match(/[a-zA-Z]+/g) || [];
        
        return chineseChars.length + englishWords.length;
    }

    /**
     * 更新解析器配置
     * @param {Object} newOptions - 新的配置选项
     */
    updateOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
    }

    /**
     * 获取当前配置
     * @returns {Object} 当前配置
     */
    getOptions() {
        return { ...this.options };
    }
}

module.exports = PageContentParser;