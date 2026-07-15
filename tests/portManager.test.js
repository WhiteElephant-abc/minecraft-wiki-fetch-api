/**
 * Port manager unit tests
 */

const EventEmitter = require('events');

jest.mock('net', () => {
    const EventEmitter = require('events');
    return {
        createServer: jest.fn(() => {
            const server = new EventEmitter();
            server.listen = jest.fn((port, host) => {
                process.nextTick(() => server.emit('listening'));
            });
            server.close = jest.fn((callback) => {
                if (callback) callback();
            });
            return server;
        })
    };
});

const { startServerSafely } = require('../src/utils/portManager');

describe('startServerSafely', () => {
    test('clears startup timeout and removes error listener on successful start', async () => {
        const mockServer = new EventEmitter();
        let capturedErrorListener = null;
        mockServer.on = jest.fn((event, listener) => {
            if (event === 'error') capturedErrorListener = listener;
            return EventEmitter.prototype.on.call(mockServer, event, listener);
        });
        mockServer.removeListener = jest.fn((event, listener) => {
            return EventEmitter.prototype.removeListener.call(mockServer, event, listener);
        });

        const mockApp = {
            listen: jest.fn((port, host, callback) => {
                process.nextTick(() => callback());
                return mockServer;
            })
        };

        const timeoutIds = [];
        let nextFakeId = 1;
        const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn, ms) => {
            const id = `fake-timeout-${nextFakeId++}`;
            timeoutIds.push({ id, fn, ms });
            return id;
        });
        const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

        const result = await startServerSafely(mockApp, 12345, '127.0.0.1', { logAttempts: false });

        const startupTimeout = timeoutIds.find(t => t.ms === 3000);
        expect(startupTimeout).toBeTruthy();
        expect(clearTimeoutSpy).toHaveBeenCalledWith(startupTimeout.id);
        expect(mockServer.removeListener).toHaveBeenCalledWith('error', capturedErrorListener);
        expect(result.server).toBe(mockServer);
        expect(result.port).toBe(12345);

        setTimeoutSpy.mockRestore();
        clearTimeoutSpy.mockRestore();
    });
});
