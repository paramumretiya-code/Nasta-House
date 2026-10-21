"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireManagerAuth = requireManagerAuth;
exports.generateManagerToken = generateManagerToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'nasto-house-super-secret-jwt-key-for-dev-only-min-32-chars';
function requireManagerAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            error: {
                code: 'UNAUTHENTICATED',
                message: 'Missing or invalid authentication token',
                requestId: req.requestId || 'req-unknown'
            }
        });
        return;
    }
    const token = authHeader.substring(7);
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (decoded.role !== 'manager' && decoded.role !== 'admin') {
            res.status(403).json({
                error: {
                    code: 'FORBIDDEN',
                    message: 'Insufficient role permissions for manager dashboard',
                    requestId: req.requestId || 'req-unknown'
                }
            });
            return;
        }
        req.user = decoded;
        next();
    }
    catch (err) {
        res.status(401).json({
            error: {
                code: 'INVALID_TOKEN',
                message: 'Authentication token has expired or is invalid',
                requestId: req.requestId || 'req-unknown'
            }
        });
    }
}
function generateManagerToken(user) {
    return jsonwebtoken_1.default.sign(user, JWT_SECRET, { expiresIn: '12h' });
}
