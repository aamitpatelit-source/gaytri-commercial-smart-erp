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
async function getConnectionString() {
    const url = process.env.DATABASE_URL;
    if (!url)
        return '';
    // Self-healing: rewrite direct Supabase IPv6 URL to IPv4 connection pooler URL
    const regex = /^(postgres|postgresql):\/\/postgres:(.+)@db\.([a-z0-9]+)\.supabase\.co:5432\/([a-zA-Z0-9_\-]+)/i;
    const match = url.match(regex);
    if (!match)
        return url;
    const protocol = match[1];
    const password = match[2];
    const projectId = match[3];
    const dbName = match[4];
    // Try both aws-0 and aws-1 pooler hosts in ap-south-1
    const hosts = [
        `aws-0-ap-south-1.pooler.supabase.com`,
        `aws-1-ap-south-1.pooler.supabase.com`
    ];
    for (const host of hosts) {
        const testUrl = `${protocol}://postgres.${projectId}:${password}@${host}:6543/${dbName}`;
        const client = new pg_1.Client({
            connectionString: testUrl,
            connectionTimeoutMillis: 3000,
            ssl: { rejectUnauthorized: false }
        });
        try {
            await client.connect();
            await client.end();
            console.log(`[DB Config] Found working pooler host: ${host}`);
            return testUrl;
        }
        catch (err) {
            console.warn(`[DB Config] Pooler host ${host} check failed: ${err.message}`);
        }
    }
    // Fallback to aws-0
    console.warn(`[DB Config] All pooler hosts failed. Falling back to aws-0.`);
    return `${protocol}://postgres.${projectId}:${password}@aws-0-ap-south-1.pooler.supabase.com:6543/${dbName}`;
}
const isProduction = process.env.NODE_ENV === 'production' || (process.env.DB_HOST && process.env.DB_HOST !== 'localhost') || !!process.env.DATABASE_URL;
const initPool = async () => {
    if (actualPool)
        return actualPool;
    if (process.env.DATABASE_URL) {
        const connectionString = await getConnectionString();
        actualPool = new pg_1.Pool({
            connectionString,
            ssl: isProduction ? { rejectUnauthorized: false } : false
        });
    }
    else {
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
        const poolInstance = await initPool();
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
    const poolInstance = await initPool();
    return poolInstance.query(text, params);
};
exports.query = query;
// Proxy to actualPool for any direct usages
const poolProxy = new Proxy({}, {
    get(target, prop, receiver) {
        if (!actualPool) {
            if (process.env.DATABASE_URL) {
                const url = process.env.DATABASE_URL;
                const regex = /^(postgres|postgresql):\/\/postgres:(.+)@db\.([a-z0-9]+)\.supabase\.co:5432\/([a-zA-Z0-9_\-]+)/i;
                const match = url.match(regex);
                const connStr = match
                    ? `${match[1]}://postgres.${match[3]}:${match[2]}@aws-0-ap-south-1.pooler.supabase.com:6543/${match[4]}`
                    : url;
                actualPool = new pg_1.Pool({
                    connectionString: connStr,
                    ssl: isProduction ? { rejectUnauthorized: false } : false
                });
            }
            else {
                actualPool = new pg_1.Pool({
                    host: process.env.DB_HOST || 'localhost',
                    port: parseInt(process.env.DB_PORT || '5432'),
                    user: process.env.DB_USER || 'postgres',
                    password: process.env.DB_PASSWORD || 'postgres',
                    database: process.env.DB_NAME || 'gaytri_erp',
                    ssl: isProduction ? { rejectUnauthorized: false } : false
                });
            }
            actualPool.on('error', (err) => {
                console.error('[Database Pool Proxy Error] Unexpected error on idle client:', err.message);
                actualPool = null;
            });
        }
        return Reflect.get(actualPool, prop, receiver);
    }
});
exports.default = poolProxy;
