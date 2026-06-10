"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = exports.checkDbConnection = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function getConnectionString() {
    const url = process.env.DATABASE_URL;
    if (!url)
        return undefined;
    // Self-healing: rewrite direct Supabase IPv6 URL to IPv4 connection pooler URL
    const regex = /^(postgres|postgresql):\/\/postgres:([^@]+)@db\.([a-z0-9]+)\.supabase\.co:5432\/([a-zA-Z0-9_\-]+)/i;
    const match = url.match(regex);
    if (match) {
        const protocol = match[1];
        const password = match[2];
        const projectId = match[3];
        const dbName = match[4];
        return `${protocol}://postgres.${projectId}:${password}@aws-0-ap-south-1.pooler.supabase.com:6543/${dbName}`;
    }
    return url;
}
const isProduction = process.env.NODE_ENV === 'production' || (process.env.DB_HOST && process.env.DB_HOST !== 'localhost') || !!process.env.DATABASE_URL;
const connectionString = getConnectionString();
const pool = connectionString
    ? new pg_1.Pool({
        connectionString,
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
