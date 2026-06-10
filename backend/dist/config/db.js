"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = exports.checkDbConnection = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const isProduction = process.env.NODE_ENV === 'production' || (process.env.DB_HOST && process.env.DB_HOST !== 'localhost') || !!process.env.DATABASE_URL;
const pool = process.env.DATABASE_URL
    ? new pg_1.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: isProduction ? { rejectUnauthorized: false } : false
    })
    : new pg_1.Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'gaytri_erp',
        ssl: isProduction ? { rejectUnauthorized: false } : false
    });
// Database health check
const checkDbConnection = async () => {
    try {
        const client = await pool.connect();
        client.release();
        console.log('PostgreSQL database connected successfully.');
        return true;
    }
    catch (error) {
        console.error('PostgreSQL database connection failed:', error);
        return false;
    }
};
exports.checkDbConnection = checkDbConnection;
const query = (text, params) => {
    return pool.query(text, params);
};
exports.query = query;
exports.default = pool;
