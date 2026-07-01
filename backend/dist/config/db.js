"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = exports.checkDbConnection = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
let actualPool = null;
const isProduction = process.env.NODE_ENV === 'production' || (process.env.DB_HOST && process.env.DB_HOST !== 'localhost') || !!process.env.DATABASE_URL;
const initPool = () => {
    if (actualPool)
        return actualPool;
    if (process.env.DATABASE_URL) {
        console.log('[DB Config] Using DATABASE_URL connection string directly.');
        actualPool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: isProduction ? { rejectUnauthorized: false } : false
        });
    }
    else {
        console.log('[DB Config] Using individual database configuration parameters.');
        actualPool = new pg_1.Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            database: process.env.DB_NAME || 'gaytri_erp',
            ssl: isProduction ? { rejectUnauthorized: false } : false
        });
    }
    // Graceful DB reconnection and error handling on pool
    actualPool.on('error', (err) => {
        console.error('[Database Pool Error] Unexpected error on idle client:', err.message);
        // Self-healing: clear the pool instance so the next query recreates a fresh pool
        actualPool = null;
    });
    return actualPool;
};
// Database health check
const checkDbConnection = async () => {
    try {
        const poolInstance = initPool();
        const client = await poolInstance.connect();
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
const query = async (text, params) => {
    const poolInstance = initPool();
    return poolInstance.query(text, params);
};
exports.query = query;
// Proxy to actualPool for any direct usages (default export)
const poolProxy = new Proxy({}, {
    get(target, prop, receiver) {
        const poolInstance = initPool();
        return Reflect.get(poolInstance, prop, receiver);
    }
});
exports.default = poolProxy;
if (process.env.DATABASE_URL) {
    const parsed = new URL(process.env.DATABASE_URL);
    console.log("DB HOST:", parsed.hostname);
    console.log("DB USER:", parsed.username);
    actualPool = new pg_1.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
}
