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
exports.rejectLeaveRequest = exports.approveLeaveRequest = exports.getLeaveRequests = exports.cancelLeaveRequest = exports.submitLeaveRequest = exports.updateLeaveBalance = exports.getLeaveBalances = void 0;
const db_1 = __importStar(require("../config/db"));
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const managerScopeService_1 = require("../services/managerScopeService");
// Get leave balances for the authenticated employee or all employees (if admin/manager)
const getLeaveBalances = async (req, res) => {
    try {
        const userRole = req.user?.role;
        const userId = req.user?.id;
        if (userRole === 'EMPLOYEE') {
            const balance = await (0, db_1.query)(`SELECT b.casual_leave, b.sick_leave, b.paid_leave,
                (SELECT COALESCE(COUNT(r.id), 0) FROM leave_requests r WHERE r.employee_id = $1 AND r.status = 'APPROVED' AND r.type = 'CASUAL')::int as casual_used,
                (SELECT COALESCE(COUNT(r.id), 0) FROM leave_requests r WHERE r.employee_id = $1 AND r.status = 'APPROVED' AND r.type = 'SICK')::int as sick_used,
                (SELECT COALESCE(COUNT(r.id), 0) FROM leave_requests r WHERE r.employee_id = $1 AND r.status = 'APPROVED' AND r.type = 'PAID')::int as paid_used
         FROM leave_balances b
         WHERE b.employee_id = $1`, [userId]);
            if (balance.rows.length === 0) {
                return res.status(200).json({
                    success: true,
                    balances: { casual_leave: 12, sick_leave: 12, paid_leave: 12, casual_used: 0, sick_used: 0, paid_used: 0 }
                });
            }
            return res.status(200).json({
                success: true,
                balances: balance.rows[0]
            });
        }
        // Admin/Manager: Fetch all balances
        let queryStr = `
      SELECT b.id, b.employee_id, b.casual_leave, b.sick_leave, b.paid_leave,
             e.full_name, e.employee_id as emp_code, d.name as department
      FROM leave_balances b
      JOIN employees e ON b.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.is_active = TRUE
    `;
        const params = [];
        if (userRole === 'MANAGER') {
            queryStr += ` AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $1) `;
            params.push(userId);
        }
        queryStr += ` ORDER BY e.employee_id ASC `;
        const result = await (0, db_1.query)(queryStr, params);
        return res.status(200).json({
            success: true,
            balances: result.rows
        });
    }
    catch (error) {
        console.error('[Leaves API] Failed to fetch balances:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.getLeaveBalances = getLeaveBalances;
// Update leave balance manually (Admin correction)
const updateLeaveBalance = async (req, res) => {
    const { id } = req.params;
    const { casual_leave, sick_leave, paid_leave } = req.body;
    if (req.user?.role === 'MANAGER') {
        return res.status(403).json({ success: false, message: 'Forbidden. Managers cannot manually adjust leave balances.' });
    }
    try {
        const result = await (0, db_1.query)(`UPDATE leave_balances 
       SET casual_leave = COALESCE($1, casual_leave),
           sick_leave = COALESCE($2, sick_leave),
           paid_leave = COALESCE($3, paid_leave),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`, [casual_leave, sick_leave, paid_leave, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Balance record not found.' });
        }
        return res.status(200).json({
            success: true,
            message: 'Leave balance updated successfully.',
            balance: result.rows[0]
        });
    }
    catch (error) {
        console.error('[Leaves API] Failed to update balance:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.updateLeaveBalance = updateLeaveBalance;
// Submit a new leave request (Employee)
const submitLeaveRequest = async (req, res) => {
    const { start_date, end_date, type, reason } = req.body;
    const employeeId = req.user?.id;
    if (!start_date || !end_date || !type || !reason) {
        return res.status(400).json({ success: false, message: 'All fields (start_date, end_date, type, reason) are required.' });
    }
    const validTypes = ['CASUAL', 'SICK', 'PAID', 'UNPAID'];
    if (!validTypes.includes(type)) {
        return res.status(400).json({ success: false, message: 'Invalid leave type.' });
    }
    try {
        const start = (0, moment_timezone_1.default)(start_date);
        const end = (0, moment_timezone_1.default)(end_date);
        if (!start.isValid() || !end.isValid()) {
            return res.status(400).json({ success: false, message: 'Invalid dates format.' });
        }
        if (end.isBefore(start)) {
            return res.status(400).json({ success: false, message: 'End date cannot be before start date.' });
        }
        const duration = end.diff(start, 'days') + 1;
        // Validate balance for employee if CL, SL, PL
        if (type !== 'UNPAID') {
            const balRes = await (0, db_1.query)('SELECT casual_leave, sick_leave, paid_leave FROM leave_balances WHERE employee_id = $1', [employeeId]);
            if (balRes.rows.length === 0) {
                return res.status(400).json({ success: false, message: 'Leave balance not initialized for employee.' });
            }
            const bal = balRes.rows[0];
            if (type === 'CASUAL' && bal.casual_leave < duration) {
                return res.status(400).json({ success: false, message: `Insufficient Casual Leave balance. Requested: ${duration}, Available: ${bal.casual_leave}` });
            }
            if (type === 'SICK' && bal.sick_leave < duration) {
                return res.status(400).json({ success: false, message: `Insufficient Sick Leave balance. Requested: ${duration}, Available: ${bal.sick_leave}` });
            }
            if (type === 'PAID' && bal.paid_leave < duration) {
                return res.status(400).json({ success: false, message: `Insufficient Paid Leave balance. Requested: ${duration}, Available: ${bal.paid_leave}` });
            }
        }
        // Insert request
        const insertRes = await (0, db_1.query)(`INSERT INTO leave_requests (employee_id, start_date, end_date, type, reason, status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING')
       RETURNING *`, [employeeId, start_date, end_date, type, reason]);
        return res.status(201).json({
            success: true,
            message: 'Leave request submitted successfully.',
            request: insertRes.rows[0]
        });
    }
    catch (error) {
        console.error('[Leaves API] Failed to submit request:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.submitLeaveRequest = submitLeaveRequest;
// Cancel a pending leave request (Employee)
const cancelLeaveRequest = async (req, res) => {
    const { id } = req.params;
    const employeeId = req.user?.id;
    try {
        const request = await (0, db_1.query)('SELECT id, employee_id, status FROM leave_requests WHERE id = $1', [id]);
        if (request.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Leave request not found.' });
        }
        const reqRow = request.rows[0];
        if (reqRow.employee_id !== employeeId) {
            return res.status(403).json({ success: false, message: 'Forbidden. You do not own this leave request.' });
        }
        if (reqRow.status !== 'PENDING') {
            return res.status(400).json({ success: false, message: `Cannot cancel a leave request that is already ${reqRow.status.toLowerCase()}.` });
        }
        await (0, db_1.query)('DELETE FROM leave_requests WHERE id = $1', [id]);
        return res.status(200).json({
            success: true,
            message: 'Leave request cancelled successfully.'
        });
    }
    catch (error) {
        console.error('[Leaves API] Failed to cancel request:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.cancelLeaveRequest = cancelLeaveRequest;
// Get leave requests list
const getLeaveRequests = async (req, res) => {
    try {
        const userRole = req.user?.role;
        const userId = req.user?.id;
        if (userRole === 'EMPLOYEE') {
            const result = await (0, db_1.query)(`SELECT r.id, r.start_date, r.end_date, r.type, r.reason, r.status, r.remarks, r.approved_at,
                mgr.full_name as approved_by_name
         FROM leave_requests r
         LEFT JOIN admins mgr ON r.approved_by = mgr.id
         WHERE r.employee_id = $1
         ORDER BY r.start_date DESC`, [userId]);
            return res.status(200).json({ success: true, requests: result.rows });
        }
        // Admin/Manager scope filter
        let queryStr = `
      SELECT r.id, r.employee_id, r.start_date, r.end_date, r.type, r.reason, r.status, r.remarks, r.approved_at,
             e.full_name as employee_name, e.employee_id as emp_code, d.name as department,
             mgr.full_name as approved_by_name
      FROM leave_requests r
      JOIN employees e ON r.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN admins mgr ON r.approved_by = mgr.id
      WHERE e.is_active = TRUE
    `;
        const params = [];
        if (userRole === 'MANAGER') {
            queryStr += ` AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $1) `;
            params.push(userId);
        }
        queryStr += ` ORDER BY r.status = 'PENDING' DESC, r.start_date DESC `;
        const result = await (0, db_1.query)(queryStr, params);
        return res.status(200).json({ success: true, requests: result.rows });
    }
    catch (error) {
        console.error('[Leaves API] Failed to fetch requests:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.getLeaveRequests = getLeaveRequests;
// Approve leave request (Manager/Admin)
const approveLeaveRequest = async (req, res) => {
    const { id } = req.params;
    const { remarks } = req.body;
    const managerId = req.user?.id;
    const userRole = req.user?.role;
    const client = await db_1.default.connect();
    try {
        await client.query('BEGIN');
        // 1. Fetch request details and lock the row
        const reqRes = await client.query(`SELECT r.id, r.employee_id, r.start_date, r.end_date, r.type, r.reason, r.status,
              e.department_id
       FROM leave_requests r
       JOIN employees e ON r.employee_id = e.id
       WHERE r.id = $1 FOR UPDATE`, [id]);
        if (reqRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Leave request not found.' });
        }
        const leaveReq = reqRes.rows[0];
        if (leaveReq.status !== 'PENDING') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: `Cannot approve a leave request that is already ${leaveReq.status.toLowerCase()}.` });
        }
        // 2. Validate Manager Scope Boundary
        const hasPermission = await (0, managerScopeService_1.canManageEmployee)(managerId, leaveReq.employee_id, userRole);
        if (!hasPermission) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, message: 'Forbidden. Employee is not assigned to you.' });
        }
        const start = (0, moment_timezone_1.default)(leaveReq.start_date);
        const end = (0, moment_timezone_1.default)(leaveReq.end_date);
        const duration = end.diff(start, 'days') + 1;
        // 3. Check and deduct balance if CL, SL, PL
        if (leaveReq.type !== 'UNPAID') {
            const balRes = await client.query('SELECT id, casual_leave, sick_leave, paid_leave FROM leave_balances WHERE employee_id = $1 FOR UPDATE', [leaveReq.employee_id]);
            if (balRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Leave balance not initialized for employee.' });
            }
            const bal = balRes.rows[0];
            let updatedCol = '';
            let currentVal = 0;
            if (leaveReq.type === 'CASUAL') {
                updatedCol = 'casual_leave';
                currentVal = bal.casual_leave;
            }
            else if (leaveReq.type === 'SICK') {
                updatedCol = 'sick_leave';
                currentVal = bal.sick_leave;
            }
            else if (leaveReq.type === 'PAID') {
                updatedCol = 'paid_leave';
                currentVal = bal.paid_leave;
            }
            if (currentVal < duration) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: `Insufficient balance to approve. Requested: ${duration}, Available: ${currentVal}` });
            }
            await client.query(`UPDATE leave_balances SET ${updatedCol} = ${updatedCol} - $1 WHERE id = $2`, [duration, bal.id]);
        }
        // 4. Update request status to APPROVED
        await client.query(`UPDATE leave_requests 
       SET status = 'APPROVED', approved_by = $1, approved_at = CURRENT_TIMESTAMP, remarks = $2
       WHERE id = $3`, [managerId, remarks || null, id]);
        // 5. Automatically generate/update attendance rows for approved dates
        let curr = (0, moment_timezone_1.default)(start);
        const endFormatted = end.format('YYYY-MM-DD');
        while (curr.format('YYYY-MM-DD') <= endFormatted) {
            const dateStr = curr.format('YYYY-MM-DD');
            // SELECT FOR UPDATE to capture DB values correctly
            const attCheck = await client.query('SELECT id, status, remarks FROM attendance WHERE employee_id = $1 AND date = $2 FOR UPDATE', [leaveReq.employee_id, dateStr]);
            const timeStr = '00:00:00';
            const attRemarks = `Leave Approved: ${leaveReq.type}`;
            if (attCheck.rows.length === 0) {
                // Insert new
                await client.query(`INSERT INTO attendance (employee_id, manager_id, date, time, status, remarks, source)
           VALUES ($1, $2, $3, $4, 'LEAVE', $5, 'MANAGER_MANUAL')`, [leaveReq.employee_id, managerId, dateStr, timeStr, attRemarks]);
            }
            else {
                const attRow = attCheck.rows[0];
                if (attRow.status !== 'LEAVE') {
                    // Update status
                    await client.query(`UPDATE attendance SET status = 'LEAVE', remarks = $1, manager_id = $2 WHERE id = $3`, [attRemarks, managerId, attRow.id]);
                    // Write audit log entry
                    await client.query(`INSERT INTO attendance_audit_logs (attendance_id, changed_by, old_status, new_status, old_remarks, new_remarks, reason)
             VALUES ($1, $2, $3, 'LEAVE', $4, $5, 'Automatic leave marking on approval')`, [attRow.id, managerId, attRow.status, attRow.remarks, attRemarks]);
                }
            }
            curr.add(1, 'days');
        }
        await client.query('COMMIT');
        return res.status(200).json({ success: true, message: 'Leave request approved and attendance auto-updated.' });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('[Leaves API] Failed to approve request:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
    finally {
        client.release();
    }
};
exports.approveLeaveRequest = approveLeaveRequest;
// Reject leave request (Manager/Admin)
const rejectLeaveRequest = async (req, res) => {
    const { id } = req.params;
    const { remarks } = req.body;
    const managerId = req.user?.id;
    const userRole = req.user?.role;
    if (!remarks || remarks.trim() === '') {
        return res.status(400).json({ success: false, message: 'Rejection remarks are mandatory.' });
    }
    const client = await db_1.default.connect();
    try {
        await client.query('BEGIN');
        const reqRes = await client.query(`SELECT r.id, r.employee_id, r.status, e.department_id
       FROM leave_requests r
       JOIN employees e ON r.employee_id = e.id
       WHERE r.id = $1 FOR UPDATE`, [id]);
        if (reqRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Leave request not found.' });
        }
        const leaveReq = reqRes.rows[0];
        if (leaveReq.status !== 'PENDING') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: `Cannot reject a leave request that is already ${leaveReq.status.toLowerCase()}.` });
        }
        // Validate Manager Scope Boundary
        const hasPermission = await (0, managerScopeService_1.canManageEmployee)(managerId, leaveReq.employee_id, userRole);
        if (!hasPermission) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, message: 'Forbidden. Employee is not assigned to you.' });
        }
        await client.query(`UPDATE leave_requests 
       SET status = 'REJECTED', approved_by = $1, approved_at = CURRENT_TIMESTAMP, remarks = $2
       WHERE id = $3`, [managerId, remarks.trim(), id]);
        await client.query('COMMIT');
        return res.status(200).json({ success: true, message: 'Leave request rejected successfully.' });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('[Leaves API] Failed to reject request:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
    finally {
        client.release();
    }
};
exports.rejectLeaveRequest = rejectLeaveRequest;
