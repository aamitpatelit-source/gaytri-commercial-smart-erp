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
exports.updateAttendanceSettings = exports.getAttendanceSettings = exports.startAutoLockScheduler = exports.lockDailyAttendance = exports.getEmployeeSummary = exports.getAuditLogs = exports.getAttendanceHistory = exports.getDashboardStats = exports.markAttendance = exports.voidAttendance = exports.getCompanyTimezone = exports.ManagerManualProvider = void 0;
const db_1 = __importStar(require("../config/db"));
const moment_timezone_1 = __importDefault(require("moment-timezone"));
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
        await client.query('BEGIN');
        for (const record of records) {
            const { employee_id, status, remarks, reason } = record;
            if (!employee_id || !status) {
                throw new Error('Each record must include employee_id and status.');
            }
            // 1. Verify Manager Scope Boundary
            if (userRole === 'MANAGER') {
                const scopeCheck = await client.query(`SELECT EXISTS (
             SELECT 1 FROM employees e
             JOIN manager_departments md ON e.department_id = md.department_id
             WHERE e.id = $1 AND md.manager_id = $2
           )`, [employee_id, changedBy]);
                if (!scopeCheck.rows[0].exists) {
                    throw new Error(`Employee ${employee_id} is outside your managed department scope.`);
                }
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
// Retrieve Attendance Dashboard Stats
const getDashboardStats = async (req, res) => {
    const tz = await (0, exports.getCompanyTimezone)();
    const today = (0, moment_timezone_1.default)().tz(tz).format('YYYY-MM-DD');
    try {
        // Total staff count
        const totalEmpRes = await (0, db_1.query)('SELECT COUNT(*) as count FROM employees WHERE is_active = TRUE');
        const totalStaff = parseInt(totalEmpRes.rows[0].count, 10);
        // Group counts by status
        const attendanceRes = await (0, db_1.query)(`SELECT status, COUNT(*) as count 
       FROM attendance 
       WHERE date = $1 AND is_deleted = FALSE
       GROUP BY status`, [today]);
        let present = 0;
        let absent = 0;
        let late = 0;
        let halfDay = 0;
        let leave = 0;
        let wfh = 0;
        let onDuty = 0;
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
        });
        const totalMarked = present + late + halfDay + absent + leave + wfh + onDuty;
        const autoAbsent = Math.max(0, totalStaff - totalMarked);
        absent += autoAbsent;
        // Fetch recent logs feed
        const feedRes = await (0, db_1.query)(`SELECT a.date, a.time, a.status, a.remarks, e.full_name, e.employee_id, d.name as department
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE a.date = $1 AND a.is_deleted = FALSE
       ORDER BY a.updated_at DESC
       LIMIT 10`, [today]);
        return res.status(200).json({
            success: true,
            stats: {
                totalStaff,
                present: present + late + halfDay + wfh + onDuty,
                absent,
                late,
                halfDay,
                leave,
                wfh,
                onDuty
            },
            feed: feedRes.rows,
        });
    }
    catch (error) {
        console.error('[Dashboard Stats Error] Aggregation failed:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};
exports.getDashboardStats = getDashboardStats;
// Retrieve Attendance History with advanced filtering
const getAttendanceHistory = async (req, res) => {
    const { start_date, end_date, status, department_id, shift_id, search } = req.query;
    try {
        let selectFields = `
      a.id, a.date, a.time, a.status, a.remarks, a.created_device, a.source, a.is_locked,
      e.full_name, e.employee_id, d.name as department, s.name as shift
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
        if (req.user && req.user.role === 'EMPLOYEE') {
            queryStr += ` AND e.id = $${counter++}`;
            params.push(req.user.id);
        }
        else {
            if (search) {
                queryStr += ` AND (e.full_name ILIKE $${counter} OR e.employee_id ILIKE $${counter})`;
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
        const finalQuery = `SELECT ${selectFields} ${queryStr} ORDER BY a.date DESC, a.time DESC`;
        const result = await (0, db_1.query)(finalQuery, params);
        return res.status(200).json({
            success: true,
            logs: result.rows,
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
        await (0, db_1.query)(`UPDATE attendance 
       SET is_locked = TRUE 
       WHERE date = $1 AND is_locked = FALSE`, [today]);
        console.log(`[Auto Lock] Daily attendance for ${today} locked successfully.`);
    }
    catch (err) {
        console.error('[Auto Lock Error] Failed to lock records:', err);
    }
};
exports.lockDailyAttendance = lockDailyAttendance;
// Scheduler bootstrap
const startAutoLockScheduler = () => {
    console.log('[Auto Lock Scheduler] Initializing EOD lock routines...');
    const scheduleNextRun = async () => {
        const tz = await (0, exports.getCompanyTimezone)();
        const now = (0, moment_timezone_1.default)().tz(tz);
        // Set target EOD time to 6:00 PM (18:00:00)
        const target = (0, moment_timezone_1.default)().tz(tz).set({ hour: 18, minute: 0, second: 0, millisecond: 0 });
        if (now.isAfter(target)) {
            target.add(1, 'day');
        }
        const delay = target.diff(now);
        console.log(`[Auto Lock Scheduler] Next lock event in ${Math.round(delay / 1000 / 60)} minutes (at ${target.format()})`);
        setTimeout(async () => {
            await (0, exports.lockDailyAttendance)();
            scheduleNextRun();
        }, delay);
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
