"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("./config/db");
const auth_1 = __importDefault(require("./routes/auth"));
const employees_1 = __importDefault(require("./routes/employees"));
const attendance_1 = __importDefault(require("./routes/attendance"));
const errorHandler_1 = require("./middleware/errorHandler");
dotenv_1.default.config();
// Ensure JWT_SECRET fallback exists to prevent boot crashes
const JWT_SECRET = process.env.JWT_SECRET || 'gaytri_face_attendance_mvp_secret_key';
process.env.JWT_SECRET = JWT_SECRET;
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Configure production-ready CORS origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'https://gaytri-commercial-web-admin.vercel.app'];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow non-browser requests (e.g. mobile app, curl)
        if (!origin)
            return callback(null, true);
        // Support Flutter Web local runs on dynamic ports
        const isLocalhost = origin.startsWith('http://localhost:') || origin === 'http://localhost';
        if (isLocalhost || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
            callback(null, true);
        }
        else {
            callback(new Error('Blocked by CORS origin security policy.'));
        }
    },
    credentials: true
}));
app.use(express_1.default.json());
// Routes mapping
app.use('/api/v1/auth', auth_1.default);
app.use('/api/v1/employees', employees_1.default);
app.use('/api/v1/attendance', attendance_1.default);
app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Gaytri Commercial Face Attendance MVP API is running.',
        timestamp: new Date().toISOString(),
    });
});
// Apply centralized error handling middleware
app.use(errorHandler_1.errorHandler);
// Bootstrap Database Schema and seed mock employees for testing convenience
const bootstrapDatabase = async () => {
    try {
        console.log('Bootstrapping database schema...');
        // Read and run schema.sql
        const schemaPath = path_1.default.join(__dirname, '../database/schema.sql');
        if (fs_1.default.existsSync(schemaPath)) {
            const schemaSql = fs_1.default.readFileSync(schemaPath, 'utf8');
            await (0, db_1.query)(schemaSql);
            console.log('Database tables and indexes verified/created successfully.');
        }
        else {
            console.warn('schema.sql file not found at:', schemaPath);
        }
        // Self-healing migration for legacy tables
        await (0, db_1.query)(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'Production';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift VARCHAR(50) DEFAULT 'Morning Shift';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS joining_date DATE DEFAULT CURRENT_DATE;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_type VARCHAR(50) DEFAULT 'MONTHLY';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'EMPLOYEE';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `);
        console.log('Legacy table columns verified/migrated.');
        // Verify if employees exist
        const empCheck = await (0, db_1.query)('SELECT COUNT(*) FROM employees');
        if (parseInt(empCheck.rows[0].count) === 0) {
            // Seed default employees (note: face_embedding is empty initially, can be registered from web)
            await (0, db_1.query)(`
        INSERT INTO employees (employee_id, full_name, department, shift, mobile) VALUES 
        ('GC-001', 'Amit Patel', 'Production', 'Morning Shift', '+919876543210'),
        ('GC-002', 'Rajesh Sharma', 'Logistics', 'Morning Shift', '+919876543211'),
        ('GC-003', 'Sunil Singh', 'Production', 'Night Shift', '+919876543212'),
        ('GC-004', 'Priya Verma', 'Quality Control', 'Morning Shift', '+919876543213')
      `);
            console.log('Seeded default employees for testing (GC-001, GC-002, GC-003, GC-004).');
        }
    }
    catch (error) {
        console.error('Database bootstrap failed:', error);
    }
};
const startServer = async () => {
    const isConnected = await (0, db_1.checkDbConnection)();
    if (isConnected) {
        await bootstrapDatabase();
    }
    else {
        console.warn('Could not run database bootstrap, database not connected.');
    }
    app.listen(PORT, () => {
        console.log(`Gaytri Commercial Face Attendance MVP Backend running on port ${PORT}`);
    });
};
startServer();
