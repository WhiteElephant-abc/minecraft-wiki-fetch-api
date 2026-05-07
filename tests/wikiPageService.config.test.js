/**
 * WikiPageService configuration tests
 */

const mockConfig = (baseUrl) => {
    jest.doMock('../src/config', () => {
        const actualConfig = jest.requireActual('../src/config');

        return {
            ...actualConfig,
            wiki: {
                ...actualConfig.wiki,
                baseUrl
            }
        };
    });
};

describe('WikiPageService configuration', () => {
    afterEach(() => {
        jest.dontMock('../src/config');
        jest.resetModules();
    });

    test('should use configured wiki base URL by default', () => {
        jest.resetModules();
        mockConfig('https://configured.example/wiki/');

        const WikiPageService = require('../src/services/wikiPageService');
        const service = new WikiPageService({
            cacheOptions: { enabled: false }
        });

        expect(service.options.baseUrl).toBe('https://configured.example/wiki/');
        expect(service.urlHandler.baseUrl).toBe('https://configured.example/wiki');
        expect(service.urlHandler.buildPageUrl('钻石')).toBe('https://configured.example/wiki/w/%E9%92%BB%E7%9F%B3');
    });

    test('should allow explicit base URL options to override configuration', () => {
        jest.resetModules();
        mockConfig('https://configured.example');

        const WikiPageService = require('../src/services/wikiPageService');
        const service = new WikiPageService({
            baseUrl: 'https://override.example',
            cacheOptions: { enabled: false }
        });

        expect(service.options.baseUrl).toBe('https://override.example');
        expect(service.urlHandler.baseUrl).toBe('https://override.example');
    });
});
