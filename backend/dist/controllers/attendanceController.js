"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmployeeStats = exports.correctAttendance = exports.employeeCheckOut = exports.employeeCheckIn = exports.updateAttendanceSettings = exports.getAttendanceSettings = exports.startAutoLockScheduler = exports.lockDailyAttendance = exports.getEmployeeSummary = exports.getAuditLogs = exports.getAttendanceHistory = exports.getDashboardStats = exports.calculateWorkingHours = exports.markAttendance = exports.voidAttendance = exports.getCompanyTimezone = exports.ManagerManualProvider = void 0;
const db_1 = __importStar(require("../config/db"));
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const managerScopeService_1 = require("../services/managerScopeService");
class ManagerManualProvider {
    sourceName = 'MANAGER_MANUAL';
    async processAttendance(client, payload) {
        const res = await client.query(`INSERT INTO attendance (employee_id, manager_id, date, time, status, remarks, created_device, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`, [
            payload.employeeId,
            payload.managerId,
            payload.date,
            payload.time,
            payload.status,
            payload.remarks || null,
            payload.createdDevice || null,
            this.sourceName
        ]);
        return { success: true, id: res.rows[0].id };
    }
}
exports.ManagerManualProvider = ManagerManualProvider;
// Registry of extensible sources
const providers = {
    'MANAGER_MANUAL': new ManagerManualProvider()
};
// Retrieve company timezone dynamically from settings
const getCompanyTimezone = async () => {
    try {
        const settings = await (0, db_1.query)('SELECT timezone FROM company_settings LIMIT 1');
        return settings.rows[0]?.timezone || 'Asia/Kolkata';
    }
    catch {
        return 'Asia/Kolkata';
    }
};
exports.getCompanyTimezone = getCompanyTimezone;
// Void attendance (ADMIN only)
const voidAttendance = async (req, res) => {
    const { id, reason } = req.body;
    if (!id || !reason || reason.trim() === '') {
        return res.status(400).json({ success: false, message: 'Attendance ID and a valid reason are required.' });
    }
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ success: false, message: 'Access denied. Administrator privileges required to void records.' });
    }
    const client = await db_1.default.connect();
    try {
        await client.query('BEGIN');
        // SELECT existing row FOR UPDATE to prevent concurrency race conditions
        const existing = await client.query('SELECT status, remarks, is_locked FROM attendance WHERE id = $1 FOR UPDATE', [id]);
        if (existing.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Attendance record not found.' });
        }
        const row = existing.rows[0];
        const oldStatus = row.status;
        const oldRemarks = row.remarks;
        // Void the record
        await client.query(`UPDATE attendance 
       SET status = 'VOIDED', remarks = $1, manager_id = $2, updated_at = NOW() 
       WHERE id = $3`, [`VOIDED - Reason: ${reason.trim()}`, req.user.id, id]);
        // Insert to immutable audit log within the same transaction
        await client.query(`INSERT INTO attendance_audit_logs (attendance_id, changed_by, old_status, new_status, old_remarks, new_remarks, reason)
       VALUES ($1, $2, $3, 'VOIDED', $4, $5, $6)`, [id, req.user.id, oldStatus, oldRemarks, `VOIDED - Reason: ${reason.trim()}`, reason.trim()]);
        await client.query('COMMIT');
        console.log(`[Admin Action] Voided attendance ${id} for reason: ${reason.trim()}`);
        return res.status(200).json({ success: true, message: 'Attendance record voided successfully.' });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('[Admin Action Error] Void attendance failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to void attendance record.' });
    }
    finally {
        client.release();
    }
};
exports.voidAttendance = voidAttendance;
// Mark / Edit Attendance (Manager same-day rules, Admin historical access)
const markAttendance = async (req, res) => {
    const { date, records } = req.body;
    const changedBy = req.user?.id;
    const userRole = req.user?.role;
    const ipAddress = req.ip || null;
    const deviceId = req.headers['x-device-id'] || null;
    if (!date || !records || !Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ success: false, message: 'Missing required fields (date, records array).' });
    }
    const tz = await (0, exports.getCompanyTimezone)();
    const todayStr = (0, moment_timezone_1.default)().tz(tz).format('YYYY-MM-DD');
    // Same-day manager restriction
    const isToday = date === todayStr;
    if (userRole === 'MANAGER' && !isToday) {
        return res.status(403).json({ success: false, message: 'Managers are restricted to logging/editing same-day attendance only.' });
    }
    const client = await db_1.default.connect();
    try {
        console.log('[Attendance Mark Diagnostic] Request Initiated:', {
            authenticatedUserId: changedBy,
            authenticatedRole: userRole,
            resolvedManagerAdminId: changedBy,
            submittedEmployeeUuids: records.map((r) => r.employee_id)
        });
        await client.query('BEGIN');
        for (const record of records) {
            const { employee_id, status, remarks, reason } = record;
            if (!employee_id || !status) {
                throw new Error('Each record must include employee_id and status.');
            }
            // 1. Verify Manager Scope Boundary
            const hasPermission = await (0, managerScopeService_1.canManageEmployee)(changedBy, employee_id, userRole);
            if (!hasPermission) {
                console.warn('[Attendance Mark Diagnostic] Scope Validation FAILED:', {
                    failedEmployeeUuid: employee_id,
                    managerId: changedBy
                });
                throw new Error('You cannot mark attendance for this employee. Please contact the administrator.');
            }
            // SELECT existing row FOR UPDATE to capture database-read old values
            const existingRes = await client.query('SELECT id, status, remarks, is_locked FROM attendance WHERE employee_id = $1 AND date = $2 FOR UPDATE', [employee_id, date]);
            const timeStr = (0, moment_timezone_1.default)().tz(tz).format('HH:mm:ss');
            if (existingRes.rows.length === 0) {
                // Create new record using extensible AttendanceProvider
                const provider = providers['MANAGER_MANUAL'];
                await provider.processAttendance(client, {
                    employeeId: employee_id,
                    managerId: changedBy || null,
                    date,
                    time: timeStr,
                    status,
                    remarks,
                    createdDevice: deviceId || undefined
                });
            }
            else {
                const row = existingRes.rows[0];
                // Verify edit locking rules
                if (row.is_locked && userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
                    throw new Error(`Attendance for employee ${employee_id} on date ${date} is locked.`);
                }
                // Verify mandatory reason
                if (!reason || reason.trim() === '') {
                    throw new Error('A mandatory reason is required to modify existing attendance records.');
                }
                // Capture authoritative old values from DB (preventing client spoofing)
                const oldStatus = row.status;
                const oldRemarks = row.remarks;
                // Perform transactional update
                await client.query(`UPDATE attendance 
           SET status = $1, remarks = $2, manager_id = $3, updated_at = NOW() 
           WHERE id = $4`, [status, remarks || null, changedBy, row.id]);
                // Insert immutable audit log record
                await client.query(`INSERT INTO attendance_audit_logs (attendance_id, changed_by, old_status, new_status, old_remarks, new_remarks, reason, ip_address, device_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [row.id, changedBy, oldStatus, status, oldRemarks, remarks || null, reason.trim(), ipAddress, deviceId]);
            }
        }
        await client.query('COMMIT');
        return res.status(200).json({ success: true, message: 'Attendance records saved successfully.' });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('[Attendance API Error] Transaction aborted:', error.message);
        return res.status(error.message.includes('scope') || error.message.includes('locked') ? 403 : 400).json({
            success: false,
            message: error.message || 'Transaction failed.'
        });
    }
    finally {
        client.release();
    }
};
exports.markAttendance = markAttendance;
// Helper to calculate working hours dynamically (without storing in database)
const calculateWorkingHours = (checkIn, checkOut, status) => {
    if (status === 'WORKING')
        return 'Running';
    if (status === 'ABSENT')
        return '00h';
    if (!checkIn || !checkOut)
        return '00h';
    try {
        const start = (0, moment_timezone_1.default)(checkIn, 'HH:mm:ss');
        const end = (0, moment_timezone_1.default)(checkOut, 'HH:mm:ss');
        if (!start.isValid() || !end.isValid())
            return '00h';
        let diffMs = end.diff(start);
        if (diffMs < 0) {
            // Shift crosses midnight boundary
            diffMs += 24 * 60 * 60 * 1000;
        }
        const duration = moment_timezone_1.default.duration(diffMs);
        const hours = Math.floor(duration.asHours());
        const minutes = duration.minutes();
        return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
    }
    catch (e) {
        return '00h';
    }
};
exports.calculateWorkingHours = calculateWorkingHours;
// Retrieve Attendance Dashboard Stats
const getDashboardStats = async (req, res) => {
    const tz = await (0, exports.getCompanyTimezone)();
    const today = (0, moment_timezone_1.default)().tz(tz).format('YYYY-MM-DD');
    try {
        const isManager = req.user && req.user.role === 'MANAGER';
        const managerId = req.user ? req.user.id : null;
        // Total staff count
        let totalEmpRes;
        if (isManager) {
            totalEmpRes = await (0, db_1.query)(`SELECT COUNT(*) as count FROM employees e
         WHERE e.is_active = TRUE
           AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $1)`, [managerId]);
        }
        else {
            totalEmpRes = await (0, db_1.query)('SELECT COUNT(*) as count FROM employees WHERE is_active = TRUE');
        }
        const totalStaff = parseInt(totalEmpRes.rows[0].count, 10);
        // Total active managers count
        const totalMgrRes = await (0, db_1.query)("SELECT COUNT(*) as count FROM admins WHERE role = 'MANAGER' AND is_active = TRUE");
        const totalManagers = parseInt(totalMgrRes.rows[0].count, 10);
        // Group counts by status
        let attendanceRes;
        if (isManager) {
            attendanceRes = await (0, db_1.query)(`SELECT a.status, COUNT(*) as count 
         FROM attendance a
         JOIN employees e ON a.employee_id = e.id
         WHERE a.date = $1 
           AND a.is_deleted = FALSE
           AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $2)
         GROUP BY a.status`, [today, managerId]);
        }
        else {
            attendanceRes = await (0, db_1.query)(`SELECT status, COUNT(*) as count 
         FROM attendance 
         WHERE date = $1 AND is_deleted = FALSE
         GROUP BY status`, [today]);
        }
        let present = 0;
        let absent = 0;
        let late = 0;
        let halfDay = 0;
        let leave = 0;
        let wfh = 0;
        let onDuty = 0;
        let working = 0;
        let missedCheckout = 0;
        attendanceRes.rows.forEach((row) => {
            if (row.status === 'PRESENT')
                present += parseInt(row.count, 10);
            if (row.status === 'LATE')
                late += parseInt(row.count, 10);
            if (row.status === 'HALF_DAY')
                halfDay += parseInt(row.count, 10);
            if (row.status === 'ABSENT')
                absent += parseInt(row.count, 10);
            if (row.status === 'LEAVE')
                leave += parseInt(row.count, 10);
            if (row.status === 'WORK_FROM_HOME')
                wfh += parseInt(row.count, 10);
            if (row.status === 'ON_DUTY')
                onDuty += parseInt(row.count, 10);
            if (row.status === 'WORKING')
                working += parseInt(row.count, 10);
            if (row.status === 'MISSED_CHECKOUT')
                missedCheckout += parseInt(row.count, 10);
        });
        // An employee is marked absent if they have no record today
        const totalMarked = present + late + halfDay + absent + leave + wfh + onDuty + working + missedCheckout;
        const autoAbsent = Math.max(0, totalStaff - totalMarked);
        absent += autoAbsent;
        // Redesigned Dashboard present count (checked in + checked out today)
        const totalPresent = present + late + halfDay + wfh + onDuty + working;
        const attendanceRate = totalStaff > 0 ? Math.round((totalPresent / totalStaff) * 100) : 100;
        const onTimeRate = totalPresent > 0 ? Math.round(((present + wfh + onDuty + working) / totalPresent) * 100) : 100;
        // Fetch First Check-In Today
        let firstCheckInRes;
        if (isManager) {
            firstCheckInRes = await (0, db_1.query)(`SELECT e.full_name, COALESCE(a.check_in_time, a.time) as check_in_time
         FROM attendance a
         JOIN employees e ON a.employee_id = e.id
         WHERE a.date = $1 AND a.is_deleted = FALSE
           AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $2)
         ORDER BY COALESCE(a.check_in_time, a.time) ASC
         LIMIT 1`, [today, managerId]);
        }
        else {
            firstCheckInRes = await (0, db_1.query)(`SELECT e.full_name, COALESCE(a.check_in_time, a.time) as check_in_time
         FROM attendance a
         JOIN employees e ON a.employee_id = e.id
         WHERE a.date = $1 AND a.is_deleted = FALSE
         ORDER BY COALESCE(a.check_in_time, a.time) ASC
         LIMIT 1`, [today]);
        }
        const firstCheckIn = firstCheckInRes.rows.length > 0 ? {
            full_name: firstCheckInRes.rows[0].full_name,
            check_in_time: firstCheckInRes.rows[0].check_in_time
        } : null;
        // Fetch Last Checkout Today (Employee Name & Checkout Time)
        let lastCheckoutRes;
        if (isManager) {
            lastCheckoutRes = await (0, db_1.query)(`SELECT e.full_name, a.check_out_time
         FROM attendance a
         JOIN employees e ON a.employee_id = e.id
         WHERE a.date = $1 AND a.check_out_time IS NOT NULL AND a.is_deleted = FALSE
           AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $2)
         ORDER BY a.check_out_time DESC
         LIMIT 1`, [today, managerId]);
        }
        else {
            lastCheckoutRes = await (0, db_1.query)(`SELECT e.full_name, a.check_out_time
         FROM attendance a
         JOIN employees e ON a.employee_id = e.id
         WHERE a.date = $1 AND a.check_out_time IS NOT NULL AND a.is_deleted = FALSE
         ORDER BY a.check_out_time DESC
         LIMIT 1`, [today]);
        }
        const lastCheckout = lastCheckoutRes.rows.length > 0 ? {
            full_name: lastCheckoutRes.rows[0].full_name,
            check_out_time: lastCheckoutRes.rows[0].check_out_time
        } : null;
        // Weekly Trend Computation (Last 7 Days)
        const dates = [];
        for (let i = 6; i >= 0; i--) {
            dates.push((0, moment_timezone_1.default)().tz(tz).subtract(i, 'days').format('YYYY-MM-DD'));
        }
        let trendRes;
        if (isManager) {
            trendRes = await (0, db_1.query)(`SELECT a.date::text as date, COUNT(CASE WHEN a.status IN ('PRESENT', 'LATE', 'HALF_DAY', 'WORK_FROM_HOME', 'ON_DUTY', 'WORKING') THEN 1 END) as present_count
         FROM attendance a
         JOIN employees e ON a.employee_id = e.id
         WHERE a.date = ANY($1) 
           AND a.is_deleted = FALSE
           AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $2)
         GROUP BY a.date`, [dates, managerId]);
        }
        else {
            trendRes = await (0, db_1.query)(`SELECT date::text as date, COUNT(CASE WHEN status IN ('PRESENT', 'LATE', 'HALF_DAY', 'WORK_FROM_HOME', 'ON_DUTY', 'WORKING') THEN 1 END) as present_count
         FROM attendance 
         WHERE date = ANY($1) AND is_deleted = FALSE
         GROUP BY date`, [dates]);
        }
        const trendMap = new Map();
        trendRes.rows.forEach((row) => {
            const dStr = (0, moment_timezone_1.default)(row.date).format('YYYY-MM-DD');
            trendMap.set(dStr, parseInt(row.present_count, 10));
        });
        const weeklyTrend = dates.map(d => {
            const pCount = trendMap.get(d) || 0;
            const aCount = Math.max(0, totalStaff - pCount);
            return {
                date: d,
                present: pCount,
                absent: aCount
            };
        });
        // Fetch recent logs feed with employee_uuid and profile_photo_url
        let feedRes;
        if (isManager) {
            feedRes = await (0, db_1.query)(`SELECT a.id as log_id, a.date, a.time, COALESCE(a.check_in_time, a.time) as check_in_time, a.check_out_time as check_out, a.status, a.remarks, e.id as employee_uuid, e.full_name, e.employee_id, e.profile_photo_url, d.name as department
         FROM attendance a
         JOIN employees e ON a.employee_id = e.id
         LEFT JOIN departments d ON e.department_id = d.id
         WHERE a.date = $1 
           AND a.is_deleted = FALSE
           AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $2)
         ORDER BY a.updated_at DESC
         LIMIT 10`, [today, managerId]);
        }
        else {
            feedRes = await (0, db_1.query)(`SELECT a.id as log_id, a.date, a.time, COALESCE(a.check_in_time, a.time) as check_in_time, a.check_out_time as check_out, a.status, a.remarks, e.id as employee_uuid, e.full_name, e.employee_id, e.profile_photo_url, d.name as department
         FROM attendance a
         JOIN employees e ON a.employee_id = e.id
         LEFT JOIN departments d ON e.department_id = d.id
         WHERE a.date = $1 AND a.is_deleted = FALSE
         ORDER BY a.updated_at DESC
         LIMIT 10`, [today]);
        }
        const feedMapped = feedRes.rows.map(row => ({
            ...row,
            working_hours: (0, exports.calculateWorkingHours)(row.check_in_time, row.check_out, row.status)
        }));
        return res.status(200).json({
            success: true,
            stats: {
                totalStaff,
                totalEmployees: totalStaff,
                totalManagers,
                present: totalPresent,
                absent,
                working,
                missedCheckout,
                late,
                halfDay,
                leave,
                wfh,
                onDuty,
                todaysVisits: totalMarked,
                livePresentCount: totalPresent,
                lastCheckout,
                firstCheckIn,
                attendanceRate,
                onTimeRate,
                weeklyTrend,
                distribution: {
                    present: totalPresent,
                    absent,
                    working,
                    missedCheckout
                },
                operationalInsights: {
                    firstCheckIn,
                    lastCheckOut: lastCheckout,
                    currentlyWorking: working,
                    attendanceRate,
                    missedCheckoutCount: missedCheckout
                }
            },
            feed: feedMapped,
        });
    }
    catch (error) {
        console.error('[Dashboard Stats Error] Aggregation failed:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};
exports.getDashboardStats = getDashboardStats;
// Retrieve Attendance History with advanced filtering and pagination
const getAttendanceHistory = async (req, res) => {
    const { start_date, end_date, status, department_id, shift_id, search, employee_id, reporting_manager } = req.query;
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    try {
        let selectFields = `
      a.id, a.date, a.time, COALESCE(a.check_in_time, a.time) as check_in_time, a.check_out_time as check_out, a.status, a.remarks, 
      a.gps_lat_in, a.gps_lng_in, a.gps_lat_out, a.gps_lng_out, a.device_name, a.network_type, a.battery_percentage, a.face_image_url,
      a.created_device, a.source, a.is_locked,
      e.id as employee_uuid, e.full_name, e.employee_id, e.mobile, d.name as department, s.name as shift
    `;
        let queryStr = `
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE a.is_deleted = FALSE
    `;
        let params = [];
        let counter = 1;
        // Apply strict filters based on role context
        if (req.user && req.user.role === 'EMPLOYEE') {
            queryStr += ` AND e.id = $${counter++}`;
            params.push(req.user.id);
        }
        else {
            // If MANAGER, restrict to their assigned employees
            if (req.user && req.user.role === 'MANAGER') {
                queryStr += ` AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $${counter++})`;
                params.push(req.user.id);
            }
            // Admin/Manager filter by specific employee ID
            if (employee_id) {
                queryStr += ` AND e.id = $${counter++}`;
                params.push(employee_id);
            }
            // Filter by reporting manager
            if (reporting_manager) {
                queryStr += ` AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $${counter++})`;
                params.push(reporting_manager);
            }
            // Generic search filters
            if (search) {
                queryStr += ` AND (e.full_name ILIKE $${counter} OR e.employee_id ILIKE $${counter} OR e.mobile ILIKE $${counter} OR d.name ILIKE $${counter})`;
                params.push(`%${search}%`);
                counter++;
            }
            if (department_id) {
                queryStr += ` AND e.department_id = $${counter++}`;
                params.push(department_id);
            }
            if (shift_id) {
                queryStr += ` AND e.shift_id = $${counter++}`;
                params.push(shift_id);
            }
        }
        if (start_date) {
            queryStr += ` AND a.date >= $${counter++}`;
            params.push(start_date);
        }
        if (end_date) {
            queryStr += ` AND a.date <= $${counter++}`;
            params.push(end_date);
        }
        if (status) {
            queryStr += ` AND a.status = $${counter++}`;
            params.push(status);
        }
        // Get total count for pagination metadata
        const countQuery = `SELECT COUNT(*) as count ${queryStr}`;
        const countRes = await (0, db_1.query)(countQuery, params);
        const totalCount = parseInt(countRes.rows[0].count, 10);
        // Apply sorting, limit, and offset
        const finalQuery = `SELECT ${selectFields} ${queryStr} ORDER BY a.date DESC, COALESCE(a.check_in_time, a.time) DESC LIMIT $${counter++} OFFSET $${counter++}`;
        const result = await (0, db_1.query)(finalQuery, [...params, limit, offset]);
        // Map rows to dynamically calculate working hours
        const logs = result.rows.map(row => ({
            ...row,
            working_hours: (0, exports.calculateWorkingHours)(row.check_in_time, row.check_out, row.status)
        }));
        return res.status(200).json({
            success: true,
            logs,
            pagination: {
                totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
    }
    catch (error) {
        console.error('[Attendance History Error] Fetch failed:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};
exports.getAttendanceHistory = getAttendanceHistory;
// Retrieve Audit logs (ADMIN only)
const getAuditLogs = async (req, res) => {
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ success: false, message: 'Access denied. Administrator privileges required.' });
    }
    try {
        const result = await (0, db_1.query)(`SELECT al.id, al.changed_at, al.old_status, al.new_status, al.old_remarks, al.new_remarks, al.reason, al.ip_address, al.device_id,
              e.full_name as employee_name, e.employee_id, adm.full_name as changed_by_name
       FROM attendance_audit_logs al
       JOIN attendance a ON al.attendance_id = a.id
       JOIN employees e ON a.employee_id = e.id
       LEFT JOIN admins adm ON al.changed_by = adm.id
       ORDER BY al.changed_at DESC`);
        return res.status(200).json({ success: true, logs: result.rows });
    }
    catch (error) {
        console.error('[Audit Logs Error] Fetch failed:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};
exports.getAuditLogs = getAuditLogs;
// Retrieve Employee Personal Summary
const getEmployeeSummary = async (req, res) => {
    if (!req.user || req.user.role !== 'EMPLOYEE') {
        return res.status(403).json({ success: false, message: 'Forbidden. Employee context required.' });
    }
    const employeeId = req.user.id;
    const tz = await (0, exports.getCompanyTimezone)();
    const now = (0, moment_timezone_1.default)().tz(tz);
    const startOfMonth = now.clone().startOf('month').format('YYYY-MM-DD');
    const endOfMonth = now.clone().endOf('month').format('YYYY-MM-DD');
    try {
        // 1. Get Leave Balance
        const balanceRes = await (0, db_1.query)('SELECT casual_leave, sick_leave, paid_leave FROM leave_balances WHERE employee_id = $1', [employeeId]);
        // 2. Count Monthly attendance stats
        const monthlyLogs = await (0, db_1.query)(`SELECT status, COUNT(*) as count 
       FROM attendance 
       WHERE employee_id = $1 AND date >= $2 AND date <= $3 AND is_deleted = FALSE
       GROUP BY status`, [employeeId, startOfMonth, endOfMonth]);
        let present = 0;
        let late = 0;
        let halfDay = 0;
        let absent = 0;
        let leaveCount = 0;
        monthlyLogs.rows.forEach((row) => {
            if (row.status === 'PRESENT')
                present = parseInt(row.count, 10);
            if (row.status === 'LATE')
                late = parseInt(row.count, 10);
            if (row.status === 'HALF_DAY')
                halfDay = parseInt(row.count, 10);
            if (row.status === 'ABSENT')
                absent = parseInt(row.count, 10);
            if (row.status === 'LEAVE')
                leaveCount = parseInt(row.count, 10);
        });
        const totalWorkingDays = present + late + halfDay + absent;
        const presentSum = present + late + (halfDay * 0.5);
        const attendancePercentage = totalWorkingDays > 0 ? Math.round((presentSum / totalWorkingDays) * 100) : 100;
        // 3. Get today's attendance status
        const todayStr = now.format('YYYY-MM-DD');
        const todayRes = await (0, db_1.query)('SELECT status, time FROM attendance WHERE employee_id = $1 AND date = $2 AND is_deleted = FALSE LIMIT 1', [employeeId, todayStr]);
        return res.status(200).json({
            success: true,
            summary: {
                attendancePercentage,
                todayStatus: todayRes.rows[0]?.status || 'NOT_MARKED',
                todayTime: todayRes.rows[0]?.time || null,
                leaves: balanceRes.rows[0] || { casual_leave: 0, sick_leave: 0, paid_leave: 0 },
                stats: {
                    present: present + late,
                    absent,
                    late,
                    halfDay,
                    leave: leaveCount
                }
            }
        });
    }
    catch (error) {
        console.error('[Employee Summary Error] Fetch failed:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};
exports.getEmployeeSummary = getEmployeeSummary;
// EOD Auto-Lock Scheduler Query
const lockDailyAttendance = async () => {
    const tz = await (0, exports.getCompanyTimezone)();
    const today = (0, moment_timezone_1.default)().tz(tz).format('YYYY-MM-DD');
    try {
        console.log(`[Auto Lock] Locking daily attendance for date: ${today}`);
        // 1. If status is WORKING (checked in but not checked out), transition to MISSED_CHECKOUT
        const missedRes = await (0, db_1.query)(`UPDATE attendance 
       SET status = 'MISSED_CHECKOUT', is_locked = TRUE, updated_at = NOW() 
       WHERE date = $1 AND status = 'WORKING' AND is_locked = FALSE`, [today]);
        // 2. Lock all other unlocked records
        const lockRes = await (0, db_1.query)(`UPDATE attendance 
       SET is_locked = TRUE, updated_at = NOW() 
       WHERE date = $1 AND is_locked = FALSE`, [today]);
        console.log(`[Auto Lock] Lock complete. Marked ${missedRes.rowCount} MISSED_CHECKOUT, locked ${lockRes.rowCount} other records.`);
    }
    catch (err) {
        console.error('[Auto Lock Error] Failed to lock records:', err);
    }
};
exports.lockDailyAttendance = lockDailyAttendance;
// Scheduler bootstrap (configurable based on Office Settings)
const startAutoLockScheduler = () => {
    console.log('[Auto Lock Scheduler] Initializing EOD lock routines...');
    const scheduleNextRun = async () => {
        try {
            const tz = await (0, exports.getCompanyTimezone)();
            const settings = await (0, db_1.query)('SELECT business_hours_end FROM company_settings LIMIT 1');
            const endTimeStr = settings.rows[0]?.business_hours_end || '18:00:00';
            const parts = endTimeStr.split(':');
            const hour = parseInt(parts[0], 10) || 18;
            const minute = parseInt(parts[1], 10) || 0;
            const now = (0, moment_timezone_1.default)().tz(tz);
            const target = (0, moment_timezone_1.default)().tz(tz).set({ hour, minute, second: 0, millisecond: 0 });
            if (now.isAfter(target)) {
                target.add(1, 'day');
            }
            const delay = target.diff(now);
            console.log(`[Auto Lock Scheduler] End-of-Day is configured at ${endTimeStr}. Next lock event in ${Math.round(delay / 1000 / 60)} minutes (at ${target.format()})`);
            setTimeout(async () => {
                await (0, exports.lockDailyAttendance)();
                scheduleNextRun();
            }, delay);
        }
        catch (err) {
            console.error('[Auto Lock Scheduler Error] Failed to schedule next run, retrying in 5 minutes...', err);
            setTimeout(scheduleNextRun, 5 * 60 * 1000);
        }
    };
    scheduleNextRun().catch(err => console.error('[Auto Lock Scheduler Boot Error] Failed:', err));
};
exports.startAutoLockScheduler = startAutoLockScheduler;
// GET /settings (Gets default shift settings)
const getAttendanceSettings = async (req, res) => {
    try {
        const result = await (0, db_1.query)('SELECT * FROM shifts ORDER BY id ASC LIMIT 1');
        if (result.rows.length === 0) {
            // Seed default shift if empty
            const insert = await (0, db_1.query)(`INSERT INTO shifts (name, checkin_start, late_after, half_day_after, checkout_time, working_hours)
         VALUES ('Morning Shift', '09:00:00', '09:15:00', '13:00:00', '17:00:00', 8.00)
         RETURNING *`);
            const row = insert.rows[0];
            return res.status(200).json({
                success: true,
                settings: {
                    shift_name: row.name,
                    checkin_start: row.checkin_start,
                    late_after: row.late_after,
                    checkout_time: row.checkout_time,
                    grace_minutes: 15
                }
            });
        }
        const row = result.rows[0];
        // Parse grace minutes as checkin_start vs late_after difference in minutes
        let graceMinutes = 15;
        try {
            const startParts = row.checkin_start.split(':');
            const lateParts = row.late_after.split(':');
            const startMinutes = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
            const lateMinutes = parseInt(lateParts[0], 10) * 60 + parseInt(lateParts[1], 10);
            graceMinutes = Math.max(0, lateMinutes - startMinutes);
        }
        catch (e) {
            // fallback
        }
        return res.status(200).json({
            success: true,
            settings: {
                shift_name: row.name,
                checkin_start: row.checkin_start,
                late_after: row.late_after,
                checkout_time: row.checkout_time,
                grace_minutes: graceMinutes
            }
        });
    }
    catch (error) {
        console.error('[Attendance API] Get settings failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.getAttendanceSettings = getAttendanceSettings;
// PUT /settings (Updates default shift settings)
const updateAttendanceSettings = async (req, res) => {
    const { shift_name, checkin_start, late_after, checkout_time, grace_minutes } = req.body;
    try {
        const result = await (0, db_1.query)('SELECT id FROM shifts ORDER BY id ASC LIMIT 1');
        // calculate late_after based on checkin_start and grace_minutes if not provided explicitly
        let calculatedLateAfter = late_after;
        if (checkin_start && grace_minutes !== undefined && !late_after) {
            const startParts = checkin_start.split(':');
            const startMinutes = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10) + Number(grace_minutes);
            const hr = Math.floor(startMinutes / 60).toString().padStart(2, '0');
            const min = (startMinutes % 60).toString().padStart(2, '0');
            calculatedLateAfter = `${hr}:${min}:00`;
        }
        if (result.rows.length === 0) {
            const name = shift_name || 'Morning Shift';
            const checkin = checkin_start || '09:00:00';
            const late = calculatedLateAfter || '09:15:00';
            const checkout = checkout_time || '17:00:00';
            const insert = await (0, db_1.query)(`INSERT INTO shifts (name, checkin_start, late_after, half_day_after, checkout_time, working_hours)
         VALUES ($1, $2, $3, '13:00:00', $4, 8.00)
         RETURNING *`, [name, checkin, late, checkout]);
            return res.status(200).json({
                success: true,
                message: 'Shift settings updated successfully.',
                settings: {
                    shift_name: insert.rows[0].name,
                    checkin_start: insert.rows[0].checkin_start,
                    late_after: insert.rows[0].late_after,
                    checkout_time: insert.rows[0].checkout_time,
                    grace_minutes: grace_minutes || 15
                }
            });
        }
        else {
            const id = result.rows[0].id;
            const name = shift_name || 'Morning Shift';
            const checkin = checkin_start || '09:00:00';
            const late = calculatedLateAfter || '09:15:00';
            const checkout = checkout_time || '17:00:00';
            const update = await (0, db_1.query)(`UPDATE shifts
         SET name = $1, checkin_start = $2, late_after = $3, checkout_time = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING *`, [name, checkin, late, checkout, id]);
            return res.status(200).json({
                success: true,
                message: 'Shift settings updated successfully.',
                settings: {
                    shift_name: update.rows[0].name,
                    checkin_start: update.rows[0].checkin_start,
                    late_after: update.rows[0].late_after,
                    checkout_time: update.rows[0].checkout_time,
                    grace_minutes: grace_minutes || 15
                }
            });
        }
    }
    catch (error) {
        console.error('[Attendance API] Update settings failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.updateAttendanceSettings = updateAttendanceSettings;
// POST /attendance/check-in (EMPLOYEE check-in)
const employeeCheckIn = async (req, res) => {
    const employeeId = req.user?.id;
    const { gps_lat, gps_lng, device_name, network_type, battery_percentage, face_image_url, remarks } = req.body;
    if (!employeeId) {
        return res.status(401).json({ success: false, message: 'Employee credentials not found.' });
    }
    const tz = await (0, exports.getCompanyTimezone)();
    const today = (0, moment_timezone_1.default)().tz(tz).format('YYYY-MM-DD');
    const nowTime = (0, moment_timezone_1.default)().tz(tz).format('HH:mm:ss');
    const client = await db_1.default.connect();
    try {
        await client.query('BEGIN');
        // 1. Check duplicate check-in
        const existing = await client.query('SELECT id, status, is_locked FROM attendance WHERE employee_id = $1 AND date = $2 FOR UPDATE', [employeeId, today]);
        if (existing.rows.length > 0 && existing.rows[0].status !== 'ABSENT') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: `Already checked in today with status ${existing.rows[0].status}.`
            });
        }
        // 2. Fetch shift details to detect late arrivals
        const shiftRes = await client.query(`SELECT s.late_after FROM employees e 
       LEFT JOIN shifts s ON e.shift_id = s.id 
       WHERE e.id = $1`, [employeeId]);
        let status = 'WORKING'; // Initially set status to WORKING since they checked in but have not checked out
        const lateAfter = shiftRes.rows[0]?.late_after || '09:15:00';
        if (nowTime > lateAfter) {
            status = 'LATE'; // Wait, let's keep status as WORKING for now so they can checkout, or LATE?
            // Wait! The user says "Present: Employee checked in and checked out. Working: Employee checked in but not checked out."
            // So if they checked in but did not check out, they are in WORKING status! Let's keep it as WORKING so we can calculate checkout.
            // Wait, is a late arrival still in WORKING status while working? Yes! A late arrival is WORKING until they checkout, then they become LATE or PRESENT.
            // Let's use WORKING as the status for all active shifts to make check-out tracking simple!
            status = 'WORKING';
        }
        let attendanceId;
        if (existing.rows.length > 0) {
            // Update the ABSENT record to WORKING
            attendanceId = existing.rows[0].id;
            await client.query(`UPDATE attendance 
         SET time = $1, check_in_time = $1, status = $2, remarks = $3, source = 'MOBILE_APP',
             gps_lat_in = $4, gps_lng_in = $5, device_name = $6, network_type = $7, battery_percentage = $8, face_image_url = $9,
             created_device = $6, updated_at = NOW()
         WHERE id = $10`, [
                nowTime,
                status,
                remarks || 'Mobile App Check-In',
                gps_lat ? parseFloat(gps_lat) : null,
                gps_lng ? parseFloat(gps_lng) : null,
                device_name || 'Mobile Device',
                network_type || 'Unknown',
                battery_percentage ? parseInt(battery_percentage, 10) : null,
                face_image_url || null,
                attendanceId
            ]);
        }
        else {
            // Insert new record
            const insertRes = await client.query(`INSERT INTO attendance 
           (employee_id, date, time, check_in_time, status, remarks, source, 
            gps_lat_in, gps_lng_in, device_name, network_type, battery_percentage, face_image_url, created_device)
         VALUES ($1, $2, $3, $3, $4, $5, 'MOBILE_APP', $6, $7, $8, $9, $10, $11, $8)
         RETURNING id`, [
                employeeId,
                today,
                nowTime,
                status,
                remarks || 'Mobile App Check-In',
                gps_lat ? parseFloat(gps_lat) : null,
                gps_lng ? parseFloat(gps_lng) : null,
                device_name || 'Mobile Device',
                network_type || 'Unknown',
                battery_percentage ? parseInt(battery_percentage, 10) : null,
                face_image_url || null
            ]);
            attendanceId = insertRes.rows[0].id;
        }
        // 3. Write audit trail
        await client.query(`INSERT INTO attendance_audit_logs (attendance_id, changed_by, old_status, new_status, old_remarks, new_remarks, reason, ip_address, device_id)
       VALUES ($1, NULL, NULL, $2, NULL, $3, 'Mobile App Check-In', $4, $5)`, [attendanceId, status, remarks || 'Mobile App Check-In', req.ip || null, device_name || null]);
        await client.query('COMMIT');
        console.log(`[Mobile App] Employee ${employeeId} checked in successfully at ${nowTime}.`);
        return res.status(200).json({
            success: true,
            message: 'Checked in successfully.',
            attendance: {
                id: attendanceId,
                check_in_time: nowTime,
                status
            }
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('[Check-In Error] Failed to check in:', error);
        return res.status(500).json({ success: false, message: 'Check-in failed. Please try again.' });
    }
    finally {
        client.release();
    }
};
exports.employeeCheckIn = employeeCheckIn;
// POST /attendance/check-out (EMPLOYEE check-out)
const employeeCheckOut = async (req, res) => {
    const employeeId = req.user?.id;
    const { gps_lat, gps_lng, remarks } = req.body;
    if (!employeeId) {
        return res.status(401).json({ success: false, message: 'Employee credentials not found.' });
    }
    const tz = await (0, exports.getCompanyTimezone)();
    const today = (0, moment_timezone_1.default)().tz(tz).format('YYYY-MM-DD');
    const nowTime = (0, moment_timezone_1.default)().tz(tz).format('HH:mm:ss');
    const client = await db_1.default.connect();
    try {
        await client.query('BEGIN');
        // 1. Get current check-in record
        const existing = await client.query('SELECT id, status, check_in_time, time, is_locked FROM attendance WHERE employee_id = $1 AND date = $2 FOR UPDATE', [employeeId, today]);
        if (existing.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'No check-in record found for today.' });
        }
        const record = existing.rows[0];
        if (record.status === 'PRESENT') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Already checked out today.' });
        }
        if (record.status !== 'WORKING' && record.status !== 'LATE') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: `Cannot check out. Today's status is ${record.status}.` });
        }
        // 2. Fetch shift details to check if late arrival was present
        const shiftRes = await client.query(`SELECT s.late_after FROM employees e 
       LEFT JOIN shifts s ON e.shift_id = s.id 
       WHERE e.id = $1`, [employeeId]);
        const lateAfter = shiftRes.rows[0]?.late_after || '09:15:00';
        const checkInTime = record.check_in_time || record.time;
        // Final status becomes LATE if check-in was after shift grace minutes, otherwise PRESENT
        const finalStatus = checkInTime > lateAfter ? 'LATE' : 'PRESENT';
        // 3. Update the record
        await client.query(`UPDATE attendance 
       SET check_out_time = $1, status = $2, remarks = $3,
           gps_lat_out = $4, gps_lng_out = $5, updated_at = NOW()
       WHERE id = $6`, [
            nowTime,
            finalStatus,
            remarks || 'Mobile App Check-Out',
            gps_lat ? parseFloat(gps_lat) : null,
            gps_lng ? parseFloat(gps_lng) : null,
            record.id
        ]);
        // 4. Write audit trail
        await client.query(`INSERT INTO attendance_audit_logs (attendance_id, changed_by, old_status, new_status, old_remarks, new_remarks, reason, ip_address)
       VALUES ($1, NULL, $2, $3, NULL, $4, 'Mobile App Check-Out', $5)`, [record.id, record.status, finalStatus, remarks || 'Mobile App Check-Out', req.ip || null]);
        await client.query('COMMIT');
        console.log(`[Mobile App] Employee ${employeeId} checked out successfully at ${nowTime}.`);
        return res.status(200).json({
            success: true,
            message: 'Checked out successfully.',
            attendance: {
                id: record.id,
                check_out_time: nowTime,
                status: finalStatus
            }
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('[Check-Out Error] Failed to check out:', error);
        return res.status(500).json({ success: false, message: 'Check-out failed. Please try again.' });
    }
    finally {
        client.release();
    }
};
exports.employeeCheckOut = employeeCheckOut;
// POST /attendance/correct (Admin correction workflow)
const correctAttendance = async (req, res) => {
    const { employee_id, date, status, check_in_time, check_out_time, remarks, reason } = req.body;
    const adminId = req.user?.id;
    if (!employee_id || !date || !status || !reason || reason.trim() === '') {
        return res.status(400).json({ success: false, message: 'Employee ID, date, status, and correction reason are required.' });
    }
    const client = await db_1.default.connect();
    try {
        await client.query('BEGIN');
        // 1. Get existing record
        const existing = await client.query('SELECT id, status, check_in_time, check_out_time, remarks FROM attendance WHERE employee_id = $1 AND date = $2 FOR UPDATE', [employee_id, date]);
        const now = (0, moment_timezone_1.default)().format('HH:mm:ss');
        const dbCheckIn = check_in_time || null;
        const dbCheckOut = check_out_time || null;
        let attendanceId;
        if (existing.rows.length === 0) {
            // Insert new corrected record
            const insertRes = await client.query(`INSERT INTO attendance 
          (employee_id, date, time, check_in_time, check_out_time, status, remarks, source, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
         RETURNING id`, [employee_id, date, dbCheckIn || now, dbCheckIn, dbCheckOut, status, remarks || 'Admin Corrected', 'ADMIN_CORRECTION', adminId]);
            attendanceId = insertRes.rows[0].id;
            // Log audit trail
            await client.query(`INSERT INTO attendance_audit_logs 
          (attendance_id, changed_by, old_status, new_status, old_remarks, new_remarks, reason)
         VALUES ($1, $2, 'ABSENT', $3, NULL, $4, $5)`, [attendanceId, adminId, status, remarks || 'Admin Corrected', `Correction: ${reason.trim()}`]);
        }
        else {
            const row = existing.rows[0];
            attendanceId = row.id;
            // Update record
            await client.query(`UPDATE attendance 
         SET status = $1, check_in_time = $2, check_out_time = $3, remarks = $4, updated_by = $5, updated_at = NOW()
         WHERE id = $6`, [status, dbCheckIn, dbCheckOut, remarks || row.remarks, adminId, attendanceId]);
            // Log audit trail
            await client.query(`INSERT INTO attendance_audit_logs 
          (attendance_id, changed_by, old_status, new_status, old_remarks, new_remarks, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                attendanceId,
                adminId,
                row.status,
                status,
                `In: ${row.check_in_time || '--'}, Out: ${row.check_out_time || '--'}, Remarks: ${row.remarks || '--'}`,
                `In: ${dbCheckIn || '--'}, Out: ${dbCheckOut || '--'}, Remarks: ${remarks || '--'}`,
                `Correction: ${reason.trim()}`
            ]);
        }
        await client.query('COMMIT');
        return res.status(200).json({ success: true, message: 'Attendance corrected successfully.' });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('[Correction Error] Failed to correct attendance:', error);
        return res.status(500).json({ success: false, message: error.message || 'Correction failed.' });
    }
    finally {
        client.release();
    }
};
exports.correctAttendance = correctAttendance;
// GET /attendance/employee/:id/stats (Monthly stats and analytics)
const getEmployeeStats = async (req, res) => {
    const { id } = req.params;
    const monthParam = req.query.month; // YYYY-MM
    if (!id) {
        return res.status(400).json({ success: false, message: 'Employee ID is required.' });
    }
    // Enforce manager permission
    if (req.user?.role === 'MANAGER') {
        const hasPermission = await (0, managerScopeService_1.canManageEmployee)(req.user.id, id, 'MANAGER');
        if (!hasPermission) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }
    }
    try {
        const tz = await (0, exports.getCompanyTimezone)();
        const targetMonth = monthParam || (0, moment_timezone_1.default)().tz(tz).format('YYYY-MM');
        // Parse start and end of month in local time
        const startOfMonth = (0, moment_timezone_1.default)(targetMonth, 'YYYY-MM').startOf('month');
        const endOfMonth = (0, moment_timezone_1.default)(targetMonth, 'YYYY-MM').endOf('month');
        const startStr = startOfMonth.format('YYYY-MM-DD');
        const endStr = endOfMonth.format('YYYY-MM-DD');
        // 1. Fetch employee details
        const empRes = await (0, db_1.query)(`SELECT e.joining_date, s.checkin_start, s.late_after, s.checkout_time
       FROM employees e
       LEFT JOIN shifts s ON e.shift_id = s.id
       WHERE e.id = $1`, [id]);
        if (empRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        const employeeInfo = empRes.rows[0];
        const lateAfterTime = employeeInfo.late_after || '09:15:00';
        // 2. Fetch all attendance logs of the month
        const logsRes = await (0, db_1.query)(`SELECT date, COALESCE(check_in_time, time) as check_in_time, check_out_time as check_out, status, remarks
       FROM attendance
       WHERE employee_id = $1 AND date >= $2 AND date <= $3 AND is_deleted = FALSE`, [id, startStr, endStr]);
        // 3. Fetch all holidays of the month
        const holidaysRes = await (0, db_1.query)('SELECT date FROM holiday_calendar WHERE date >= $1 AND date <= $2', [startStr, endStr]);
        const holidayDates = new Set(holidaysRes.rows.map(h => (0, moment_timezone_1.default)(h.date).format('YYYY-MM-DD')));
        // 4. Group logs by date
        const logsByDate = {};
        logsRes.rows.forEach(row => {
            const formattedDate = (0, moment_timezone_1.default)(row.date).format('YYYY-MM-DD');
            logsByDate[formattedDate] = row;
        });
        let presentDays = 0;
        let absentDays = 0;
        let workingDays = 0; // WORKING
        let holidayDays = 0; // weekends + holidays
        let lateArrivals = 0;
        let missedCheckoutCount = 0;
        let lastAttendanceDate = '';
        const checkInTimesInMinutes = [];
        const checkOutTimesInMinutes = [];
        let totalWorkingMinutes = 0;
        const workingHoursTrend = [];
        const checkInTrend = [];
        const checkOutTrend = [];
        // Loop through every day of the month
        const daysInMonth = endOfMonth.date();
        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = startOfMonth.clone().date(day);
            const dateStr = currentDate.format('YYYY-MM-DD');
            const isWeekend = currentDate.day() === 0 || currentDate.day() === 6; // Sat or Sun
            const isHoliday = holidayDates.has(dateStr);
            const log = logsByDate[dateStr];
            if (log) {
                const checkIn = log.check_in_time;
                const checkOut = log.check_out;
                if (log.status === 'WORKING') {
                    workingDays++;
                    lastAttendanceDate = dateStr;
                }
                else if (log.status === 'PRESENT' || log.status === 'LATE' || log.status === 'HALF_DAY' || log.status === 'WORK_FROM_HOME' || log.status === 'ON_DUTY') {
                    presentDays++;
                    lastAttendanceDate = dateStr;
                    if (checkIn) {
                        const checkInParts = checkIn.split(':');
                        const minutes = parseInt(checkInParts[0]) * 60 + parseInt(checkInParts[1]);
                        checkInTimesInMinutes.push(minutes);
                        checkInTrend.push({ date: dateStr, time: checkIn.substring(0, 5) });
                    }
                    if (checkOut) {
                        const checkOutParts = checkOut.split(':');
                        const minutes = parseInt(checkOutParts[0]) * 60 + parseInt(checkOutParts[1]);
                        checkOutTimesInMinutes.push(minutes);
                        checkOutTrend.push({ date: dateStr, time: checkOut.substring(0, 5) });
                    }
                    if (checkIn && checkOut) {
                        const start = (0, moment_timezone_1.default)(checkIn, 'HH:mm:ss');
                        const end = (0, moment_timezone_1.default)(checkOut, 'HH:mm:ss');
                        let diffMs = end.diff(start);
                        if (diffMs < 0)
                            diffMs += 24 * 60 * 60 * 1000;
                        const minutes = Math.floor(diffMs / 60000);
                        totalWorkingMinutes += minutes;
                        workingHoursTrend.push({ date: dateStr, hours: parseFloat((minutes / 60).toFixed(2)) });
                    }
                    if (checkIn && checkIn > lateAfterTime) {
                        lateArrivals++;
                    }
                }
                else if (log.status === 'ABSENT') {
                    absentDays++;
                }
                else if (log.status === 'MISSED_CHECKOUT') {
                    missedCheckoutCount++;
                    lastAttendanceDate = dateStr;
                }
            }
            else {
                // No record exists
                if (isWeekend || isHoliday) {
                    holidayDays++;
                }
                else {
                    // If past today or joining date, it is absent
                    const todayMoment = (0, moment_timezone_1.default)().tz(tz).startOf('day');
                    const joinMoment = (0, moment_timezone_1.default)(employeeInfo.joining_date).startOf('day');
                    if (currentDate.isSameOrBefore(todayMoment) && currentDate.isSameOrAfter(joinMoment)) {
                        absentDays++;
                    }
                    else {
                        // Future dates or pre-joining dates are holidays/weekend default
                        holidayDays++;
                    }
                }
            }
        }
        // Helper to format minutes from midnight back to HH:mm A
        const formatMinutesTo12Hour = (totalMinutes) => {
            const hours = Math.floor(totalMinutes / 60);
            const minutes = Math.round(totalMinutes % 60);
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const displayHours = hours % 12 || 12;
            return `${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
        };
        const avgCheckInMinutes = checkInTimesInMinutes.length > 0
            ? checkInTimesInMinutes.reduce((a, b) => a + b, 0) / checkInTimesInMinutes.length
            : null;
        const avgCheckOutMinutes = checkOutTimesInMinutes.length > 0
            ? checkOutTimesInMinutes.reduce((a, b) => a + b, 0) / checkOutTimesInMinutes.length
            : null;
        const avgCheckInTime = avgCheckInMinutes !== null ? formatMinutesTo12Hour(avgCheckInMinutes) : '--:--';
        const avgCheckOutTime = avgCheckOutMinutes !== null ? formatMinutesTo12Hour(avgCheckOutMinutes) : '--:--';
        const workingHours = Math.floor(totalWorkingMinutes / 60);
        const workingMinutes = Math.round(totalWorkingMinutes % 60);
        const totalWorkingHoursStr = `${workingHours.toString().padStart(2, '0')}h ${workingMinutes.toString().padStart(2, '0')}m`;
        const totalActiveDays = presentDays + absentDays + workingDays + missedCheckoutCount;
        const monthlyAttendancePercentage = totalActiveDays > 0
            ? Math.round(((presentDays + workingDays) / totalActiveDays) * 100)
            : 100;
        // Analytics Sufficiency Guard: show analytics only when sufficient data (>= 3 present/working records) exists
        const sufficientData = (presentDays + workingDays) >= 3;
        return res.status(200).json({
            success: true,
            summary: {
                presentDays,
                absentDays,
                workingDays,
                holidays: holidayDays,
                avgCheckInTime,
                avgCheckOutTime,
                totalWorkingHours: totalWorkingHoursStr,
                lateArrivals,
                missedCheckoutCount,
                lastAttendanceDate: lastAttendanceDate ? (0, moment_timezone_1.default)(lastAttendanceDate).format('YYYY-MM-DD') : 'N/A'
            },
            analytics: {
                sufficientData,
                monthlyAttendancePercentage,
                workingHoursTrend: sufficientData ? workingHoursTrend : [],
                checkInTrend: sufficientData ? checkInTrend : [],
                checkOutTrend: sufficientData ? checkOutTrend : []
            }
        });
    }
    catch (error) {
        console.error('[Employee Stats Error] Aggregation failed:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};
exports.getEmployeeStats = getEmployeeStats;
