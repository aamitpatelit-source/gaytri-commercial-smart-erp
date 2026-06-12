"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const JWT_SECRET = process.env.JWT_SECRET || 'gaytri_commercial_smart_erp_jwt_secret_2026';
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // Direct active status check for employees
        if (decoded.role === 'EMPLOYEE') {
            const { query } = require('../config/db');
            const statusRes = await query('SELECT is_active FROM employees WHERE id = $1', [decoded.id]);
            if (statusRes.rows.length === 0 || !statusRes.rows[0].is_active) {
                return res.status(403).json({ success: false, message: 'Access denied. Account has been deactivated.' });
            }
        }
        // Direct active status check for admins/managers
        if (decoded.role === 'ADMIN' || decoded.role === 'SUPER_ADMIN' || decoded.role === 'MANAGER' || decoded.role === 'HR_MANAGER') {
            const { query } = require('../config/db');
            const statusRes = await query('SELECT is_active FROM admins WHERE id = $1', [decoded.id]);
            if (statusRes.rows.length === 0 || !statusRes.rows[0].is_active) {
                return res.status(403).json({ success: false, message: 'Access denied. Administrator account has been deactivated.' });
            }
        }
        req.user = decoded;
        next();
    }
    catch (error) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    }
};
exports.authenticateToken = authenticateToken;
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Authentication required.' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Forbidden. Requires one of the following roles: ${roles.join(', ')}`,
            });
        }
        next();
    };
};
exports.requireRole = requireRole;
