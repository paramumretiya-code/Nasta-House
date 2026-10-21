"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, req, res, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
next) {
    const status = err.status || (err.statusCode ? Number(err.statusCode) : 500);
    const code = err.code || 'INTERNAL_SERVER_ERROR';
    const message = err.message || 'An unexpected error occurred';
    const requestId = req.requestId || req.headers['x-request-id'] || 'req-unknown';
    if (status >= 500) {
        console.error(`[Error] [${requestId}] ${req.method} ${req.url}:`, err);
    }
    res.status(status).json({
        error: {
            code,
            message,
            requestId
        }
    });
}
