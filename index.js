"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const node_http_1 = __importDefault(require("node:http"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const node_path_1 = __importDefault(require("node:path"));
const uuid_1 = require("uuid");
// Load environment variables
dotenv_1.default.config();
// Also attempt to load from repository root if run from server subfolder
dotenv_1.default.config({ path: node_path_1.default.resolve(process.cwd(), '../.env') });
dotenv_1.default.config({ path: node_path_1.default.resolve(process.cwd(), '.env') });
const index_js_1 = require("./db/index.js");
const realtime_js_1 = require("./services/realtime.js");
const menu_js_1 = require("./routes/menu.js");
const orders_js_1 = require("./routes/orders.js");
const manager_js_1 = require("./routes/manager.js");
const webhooks_js_1 = require("./routes/webhooks.js");
const errorHandler_js_1 = require("./middleware/errorHandler.js");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
// CORS setup
const allowedOrigins = [
    process.env.CUSTOMER_ORIGIN || 'http://localhost:5173',
    process.env.MANAGER_ORIGIN || 'http://localhost:5174',
    'http://localhost:5173',
    'http://localhost:5174'
];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
            callback(null, true);
        }
        else {
            callback(null, true); // Dev-friendly fallback
        }
    },
    credentials: true
}));
// Capture raw body for webhook HMAC checks while parsing JSON
app.use(express_1.default.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
    }
}));
// Request ID middleware
app.use((req, _res, next) => {
    req.requestId = req.headers['x-request-id'] || `req_${(0, uuid_1.v4)().substring(0, 8)}`;
    next();
});
// Logging middleware
app.use((req, _res, next) => {
    const start = Date.now();
    _res.on('finish', () => {
        const duration = Date.now() - start;
        if (req.url !== '/health') {
            console.log(`[HTTP] ${req.method} ${req.url} ${_res.statusCode} ${duration}ms [${req.requestId}]`);
        }
    });
    next();
});
// Health check
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});
// API Routes
app.use('/api/v1', menu_js_1.menuRouter);
app.use('/api/v1', orders_js_1.ordersRouter);
app.use('/api/v1', manager_js_1.managerRouter);
app.use('/api/v1', webhooks_js_1.webhooksRouter);
// Central error handler
app.use(errorHandler_js_1.errorHandler);
// Create HTTP and WebSocket server
const server = node_http_1.default.createServer(app);
realtime_js_1.realtimeService.init(server);
// Start server
async function startServer() {
    try {
        const db = await (0, index_js_1.getDatabase)();
        console.log('[Server] Database initialized successfully.');
        server.listen(PORT, () => {
            console.log(`=======================================================`);
            console.log(`  🍽️  Nasto House API Server running on port ${PORT}`);
            console.log(`  ⚡ Realtime WebSocket ready at ws://localhost:${PORT}/ws`);
            console.log(`  Customer Origin: ${process.env.CUSTOMER_ORIGIN || 'http://localhost:5173'}`);
            console.log(`  Manager Origin:  ${process.env.MANAGER_ORIGIN || 'http://localhost:5174'}`);
            console.log(`=======================================================`);
        });
    }
    catch (err) {
        console.error('Fatal error starting server:', err);
        process.exit(1);
    }
}
// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received. Closing server.');
    realtime_js_1.realtimeService.destroy();
    server.close(() => {
        process.exit(0);
    });
});
startServer();
