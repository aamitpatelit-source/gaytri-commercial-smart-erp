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
exports.getEmployeeMetaData = exports.getEmployeeById = exports.deleteEmployee = exports.updateEmployee = exports.createEmployee = exports.getEmployees = void 0;
const db_1 = __importStar(require("../config/db"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const managerScopeService_1 = require("../services/managerScopeService");
const calculationService_1 = require("../services/calculationService");
// Get all employees
const getEmployees = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    try {
        let queryStr = `
       SELECT e.id, e.employee_id, e.full_name, e.mobile, e.joining_date, e.salary_type, COALESCE(e.monthly_salary, 0.00) as monthly_salary, e.role, e.is_active,
              COALESCE(e.profile_image_url, e.profile_photo_url) as profile_image_url, COALESCE(e.profile_photo_url, e.profile_image_url) as profile_photo_url,
              e.require_password_change, e.created_at, e.updated_at,
              d.name as department, d.id as department_id,
              dg.name as designation, dg.id as designation_id,
              s.name as shift, s.id as shift_id,
              (SELECT string_agg(adm.full_name, ', ') 
               FROM manager_employees me 
               JOIN admins adm ON me.manager_id = adm.id 
               WHERE me.employee_id = e.id) as reporting_manager
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN designations dg ON e.designation_id = dg.id
       LEFT JOIN shifts s ON e.shift_id = s.id
       WHERE (e.is_deleted = FALSE OR e.is_deleted IS NULL)
    `;
        const params = [];
        if (req.user.role === 'MANAGER') {
            queryStr += ` AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $1) `;
            params.push(req.user.id);
        }
        queryStr += ` ORDER BY e.employee_id ASC `;
        const result = await (0, db_1.query)(queryStr, params);
        console.log(`[Employee Info] Fetched ${result.rows.length} employees from database.`);
        return res.status(200).json({
            success: true,
            employees: result.rows,
        });
    }
    catch (error) {
        console.error('[Employee Error] Get employees failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.getEmployees = getEmployees;
// Create a new employee
const createEmployee = async (req, res) => {
    const { employee_id, full_name, department_id, designation_id, shift_id, mobile, joining_date, salary_type, monthly_salary, profile_photo_url, profile_image_url, password, is_active, manager_id, } = req.body;
    const imageUrl = profile_image_url || profile_photo_url || null;
    if (!employee_id || !full_name || !mobile) {
        return res.status(400).json({ success: false, message: 'Missing required information (employee_id, full_name, mobile)' });
    }
    const client = await db_1.default.connect();
    try {
        await client.query('BEGIN');
        // Check duplicate employee_id
        const duplicateCheck = await client.query('SELECT id FROM employees WHERE employee_id = $1', [employee_id.trim()]);
        if (duplicateCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Employee ID already exists' });
        }
        const joiningDate = joining_date ? new Date(joining_date) : new Date();
        const salaryType = (salary_type || 'MONTHLY').toUpperCase();
        const monthlySalary = parseFloat(monthly_salary) || 0.00;
        const activeStatus = is_active !== false;
        // Enforce secure credentials activation
        let finalHash;
        let requireChange = true;
        if (password && password.trim() !== '') {
            // Hashed credentials
            finalHash = await bcryptjs_1.default.hash(password, 10);
            requireChange = req.body.require_password_change !== false;
        }
        else {
            // Secure unique temporary password (e.g. Gaytri@GC-0001)
            const tempPassword = `Gaytri@${employee_id.trim()}`;
            finalHash = await bcryptjs_1.default.hash(tempPassword, 10);
            requireChange = true;
        }
        // Enforce designation_id resolution (by ID, by name string, or auto-insert)
        let resolvedDesignationId = designation_id ? parseInt(designation_id, 10) : null;
        if ((!resolvedDesignationId || isNaN(resolvedDesignationId)) && req.body.designation) {
            const desigLookup = await client.query('SELECT id FROM designations WHERE name = $1 LIMIT 1', [req.body.designation.trim()]);
            if (desigLookup.rows.length > 0) {
                resolvedDesignationId = desigLookup.rows[0].id;
            }
            else {
                const desigIns = await client.query('INSERT INTO designations (name) VALUES ($1) RETURNING id', [req.body.designation.trim()]);
                resolvedDesignationId = desigIns.rows[0].id;
            }
        }
        // Enforce shift_id resolution (by ID, by name string, or fallback)
        let resolvedShiftId = shift_id ? parseInt(shift_id, 10) : null;
        if ((!resolvedShiftId || isNaN(resolvedShiftId)) && req.body.shift) {
            const shiftLookup = await client.query('SELECT id FROM shifts WHERE name = $1 LIMIT 1', [req.body.shift.trim()]);
            if (shiftLookup.rows.length > 0) {
                resolvedShiftId = shiftLookup.rows[0].id;
            }
            else {
                const isNight = req.body.shift.trim() === 'Night Shift';
                const shiftIns = await client.query(`INSERT INTO shifts (name, checkin_start, late_after, half_day_after, checkout_time) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`, [
                    req.body.shift.trim(),
                    isNight ? '20:00:00' : '09:00:00',
                    isNight ? '20:15:00' : '09:15:00',
                    isNight ? '00:00:00' : '13:00:00',
                    isNight ? '04:00:00' : '17:00:00'
                ]);
                resolvedShiftId = shiftIns.rows[0].id;
            }
        }
        if (!resolvedShiftId || isNaN(resolvedShiftId)) {
            const defaultShiftLookup = await client.query('SELECT id FROM shifts ORDER BY id ASC LIMIT 1');
            if (defaultShiftLookup.rows.length > 0) {
                resolvedShiftId = defaultShiftLookup.rows[0].id;
            }
        }
        const empResult = await client.query(`INSERT INTO employees (
        employee_id, full_name, department_id, designation_id, shift_id, mobile,
        joining_date, salary_type, monthly_salary, profile_photo_url, profile_image_url, role, password_hash, is_active, require_password_change
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'EMPLOYEE', $12, $13, $14)
       RETURNING id, employee_id, full_name, is_active, monthly_salary, profile_photo_url, profile_image_url`, [
            employee_id.trim(),
            full_name.trim(),
            department_id || null,
            resolvedDesignationId,
            resolvedShiftId,
            mobile.trim(),
            joiningDate,
            salaryType,
            monthlySalary,
            imageUrl,
            imageUrl,
            finalHash,
            activeStatus,
            requireChange,
        ]);
        const newEmployeeId = empResult.rows[0].id;
        // Create manager-employee mapping if manager_id is specified
        if (manager_id) {
            const managerIds = Array.isArray(manager_id) ? manager_id : [manager_id];
            for (const mId of managerIds) {
                if (mId && mId.trim() !== '') {
                    await client.query('INSERT INTO manager_employees (manager_id, employee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [mId.trim(), newEmployeeId]);
                }
            }
        }
        // Create default leave balances for the new employee
        await client.query(`INSERT INTO leave_balances (employee_id, casual_leave, sick_leave, paid_leave)
       VALUES ($1, 12, 12, 12)
       ON CONFLICT (employee_id) DO NOTHING`, [newEmployeeId]);
        // Log the creation
        await client.query(`INSERT INTO audit_logs (action, details, performed_by, performed_by_role)
       VALUES ('EMPLOYEE_CREATED', $1, $2, $3)`, [`Created employee ${employee_id.trim()} (${full_name.trim()})`, req.user?.id || null, req.user?.role || 'SYSTEM']);
        await client.query('COMMIT');
        console.log(`[Employee Info] Created employee: ${employee_id} - UUID: ${newEmployeeId} under transactional scope.`);
        return res.status(201).json({
            success: true,
            message: 'Employee created successfully',
            employee: empResult.rows[0],
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('[Employee Error] Create employee failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
    finally {
        client.release();
    }
};
exports.createEmployee = createEmployee;
// Update an existing employee
const updateEmployee = async (req, res) => {
    const { id } = req.params;
    const { full_name, department_id, designation_id, shift_id, mobile, joining_date, salary_type, password, is_active, require_password_change, } = req.body;
    if (!full_name || !mobile) {
        return res.status(400).json({ success: false, message: 'Missing required information (full_name, mobile)' });
    }
    try {
        const empCheck = await (0, db_1.query)('SELECT id, employee_id, full_name FROM employees WHERE id = $1', [id]);
        if (empCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        const employee = empCheck.rows[0];
        const activeStatus = is_active !== false;
        let resolvedDesignationId = designation_id ? parseInt(designation_id, 10) : null;
        if ((!resolvedDesignationId || isNaN(resolvedDesignationId)) && req.body.designation) {
            const desigLookup = await (0, db_1.query)('SELECT id FROM designations WHERE name = $1 LIMIT 1', [req.body.designation.trim()]);
            if (desigLookup.rows.length > 0) {
                resolvedDesignationId = desigLookup.rows[0].id;
            }
            else {
                const desigIns = await (0, db_1.query)('INSERT INTO designations (name) VALUES ($1) RETURNING id', [req.body.designation.trim()]);
                resolvedDesignationId = desigIns.rows[0].id;
            }
        }
        let resolvedShiftId = shift_id ? parseInt(shift_id, 10) : null;
        if ((!resolvedShiftId || isNaN(resolvedShiftId)) && req.body.shift) {
            const shiftLookup = await (0, db_1.query)('SELECT id FROM shifts WHERE name = $1 LIMIT 1', [req.body.shift.trim()]);
            if (shiftLookup.rows.length > 0) {
                resolvedShiftId = shiftLookup.rows[0].id;
            }
            else {
                const isNight = req.body.shift.trim() === 'Night Shift';
                const shiftIns = await (0, db_1.query)(`INSERT INTO shifts (name, checkin_start, late_after, half_day_after, checkout_time) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`, [
                    req.body.shift.trim(),
                    isNight ? '20:00:00' : '09:00:00',
                    isNight ? '20:15:00' : '09:15:00',
                    isNight ? '00:00:00' : '13:00:00',
                    isNight ? '04:00:00' : '17:00:00'
                ]);
                resolvedShiftId = shiftIns.rows[0].id;
            }
        }
        let updateFields = [
            'full_name = $1',
            'department_id = $2',
            'designation_id = $3',
            'shift_id = $4',
            'mobile = $5',
            'is_active = $6',
            'updated_at = NOW()',
        ];
        let params = [
            full_name.trim(),
            department_id || null,
            resolvedDesignationId,
            resolvedShiftId,
            mobile.trim(),
            activeStatus,
        ];
        let count = 7;
        if (joining_date) {
            updateFields.push(`joining_date = $${count++}`);
            params.push(new Date(joining_date));
        }
        if (salary_type) {
            updateFields.push(`salary_type = $${count++}`);
            params.push(salary_type.toUpperCase());
        }
        if (req.body.monthly_salary !== undefined) {
            updateFields.push(`monthly_salary = $${count++}`);
            params.push(parseFloat(req.body.monthly_salary) || 0.00);
        }
        if (req.body.profile_photo_url !== undefined || req.body.profile_image_url !== undefined) {
            const imgVal = req.body.profile_image_url !== undefined ? req.body.profile_image_url : req.body.profile_photo_url;
            updateFields.push(`profile_photo_url = $${count++}`);
            params.push(imgVal || null);
            updateFields.push(`profile_image_url = $${count++}`);
            params.push(imgVal || null);
        }
        if (password && password.trim() !== '') {
            const hash = await bcryptjs_1.default.hash(password, 10);
            updateFields.push(`password_hash = $${count++}`);
            params.push(hash);
        }
        if (require_password_change !== undefined) {
            updateFields.push(`require_password_change = $${count++}`);
            params.push(!!require_password_change);
        }
        params.push(id);
        const updateQuery = `UPDATE employees SET ${updateFields.join(', ')} WHERE id = $${count}`;
        await (0, db_1.query)(updateQuery, params);
        // Sync manager assignment
        if (req.body.manager_id !== undefined) {
            await (0, db_1.query)('DELETE FROM manager_employees WHERE employee_id = $1', [id]);
            if (req.body.manager_id && req.body.manager_id.trim() !== '') {
                await (0, db_1.query)('INSERT INTO manager_employees (manager_id, employee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.body.manager_id.trim(), id]);
            }
        }
        // Log the update
        await (0, db_1.query)(`INSERT INTO audit_logs (action, details, performed_by, performed_by_role)
       VALUES ('EMPLOYEE_UPDATED', $1, $2, $3)`, [`Updated employee ${employee.employee_id} (${full_name.trim()})`, req.user?.id || null, req.user?.role || 'SYSTEM']);
        console.log(`[Employee Info] Updated employee: ${id} (${full_name.trim()})`);
        const updatedEmpRes = await (0, db_1.query)(`SELECT e.id, e.employee_id, e.full_name, e.mobile, e.joining_date, e.salary_type, COALESCE(e.monthly_salary, 0.00) as monthly_salary, e.role, e.is_active,
              COALESCE(e.profile_image_url, e.profile_photo_url) as profile_image_url,
              COALESCE(e.profile_photo_url, e.profile_image_url) as profile_photo_url
       FROM employees e WHERE e.id = $1`, [id]);
        return res.status(200).json({
            success: true,
            message: 'Employee updated successfully',
            employee: updatedEmpRes.rows[0] || null
        });
    }
    catch (error) {
        console.error('[Employee Error] Update employee failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.updateEmployee = updateEmployee;
// Delete employee (Marks inactive or deletes based on company policy, here we delete)
const deleteEmployee = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await (0, db_1.query)(`UPDATE employees 
       SET is_deleted = TRUE, is_active = FALSE, deleted_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL) 
       RETURNING id, employee_id, full_name`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        const employee = result.rows[0];
        // Log the deletion
        await (0, db_1.query)(`INSERT INTO audit_logs (action, details, performed_by, performed_by_role)
       VALUES ('EMPLOYEE_DELETED', $1, $2, $3)`, [`Deleted employee ${employee.employee_id} (${employee.full_name})`, req.user?.id || null, req.user?.role || 'SYSTEM']);
        console.log(`[Employee Info] Deleted employee: ${employee.full_name} (${employee.employee_id})`);
        return res.status(200).json({
            success: true,
            message: 'Employee deleted successfully',
        });
    }
    catch (error) {
        console.error('[Employee Error] Delete employee failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.deleteEmployee = deleteEmployee;
// Get employee by ID
const getEmployeeById = async (req, res) => {
    const { id } = req.params;
    const loggedInUser = req.user;
    try {
        // If manager, check scope boundaries
        if (loggedInUser?.role === 'MANAGER') {
            const hasPermission = await (0, managerScopeService_1.canManageEmployee)(loggedInUser.id, id, 'MANAGER');
            if (!hasPermission) {
                return res.status(403).json({ success: false, message: 'Access denied. Employee outside manager scope.' });
            }
        }
        const employeeRes = await (0, db_1.query)(`SELECT e.id, e.employee_id, e.full_name, e.mobile, e.joining_date, e.salary_type, COALESCE(e.monthly_salary, 0.00) as monthly_salary, e.role, e.is_active,
              COALESCE(e.profile_image_url, e.profile_photo_url) as profile_image_url,
              COALESCE(e.profile_photo_url, e.profile_image_url) as profile_photo_url,
              d.name as department, d.id as department_id,
              dg.name as designation, dg.id as designation_id,
              s.name as shift, s.id as shift_id,
              (
                SELECT adm.full_name FROM manager_employees me
                JOIN admins adm ON me.manager_id = adm.id
                WHERE me.employee_id = e.id
                LIMIT 1
              ) as manager_name,
              (
                SELECT me.manager_id FROM manager_employees me
                WHERE me.employee_id = e.id
                LIMIT 1
              ) as manager_id,
              (
                SELECT a.date FROM attendance a
                WHERE a.employee_id = e.id AND a.is_deleted = FALSE AND a.status != 'ABSENT'
                ORDER BY a.date DESC
                LIMIT 1
              ) as last_attendance_date,
              (
                SELECT a.status FROM attendance a
                WHERE a.employee_id = e.id AND a.date = CURRENT_DATE AND a.is_deleted = FALSE
                LIMIT 1
              ) as current_status,
              (
                SELECT COALESCE(a.check_in_time, a.time) FROM attendance a
                WHERE a.employee_id = e.id AND a.date = CURRENT_DATE AND a.is_deleted = FALSE
                LIMIT 1
              ) as todays_check_in,
              (
                SELECT a.check_out_time FROM attendance a
                WHERE a.employee_id = e.id AND a.date = CURRENT_DATE AND a.is_deleted = FALSE
                LIMIT 1
              ) as todays_check_out
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN designations dg ON e.designation_id = dg.id
       LEFT JOIN shifts s ON e.shift_id = s.id
       WHERE e.id = $1`, [id]);
        if (employeeRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        const emp = employeeRes.rows[0];
        const settings = calculationService_1.DEFAULT_ATTENDANCE_PAYROLL_SETTINGS;
        const monthlySalary = parseFloat(emp.monthly_salary) || 0.00;
        const workingDays = settings.monthly_working_days || 26;
        const dailyRate = monthlySalary > 0 && workingDays > 0 ? monthlySalary / workingDays : 0;
        const paidHoursPerDay = settings.paid_working_hours || 9;
        const hourlyRate = dailyRate > 0 && paidHoursPerDay > 0 ? dailyRate / paidHoursPerDay : 0;
        let todaysWorkedHours = 0;
        let todaysPaidHours = 0;
        let todaysLunchDeduction = 0;
        let todaysLateMinutes = 0;
        let isLate = emp.current_status === 'LATE';
        let isEarlyDeparture = false;
        let todaysDailySalary = 0;
        if (emp.todays_check_in) {
            const nowTime = new Date().toTimeString().split(' ')[0];
            const checkOutTime = emp.todays_check_out || nowTime;
            const checkInMins = (0, calculationService_1.getMinutesFromInput)(emp.todays_check_in);
            const shiftStartMins = (0, calculationService_1.parseTimeToMinutes)(settings.shift_start_time || '09:00');
            isLate = isLate || checkInMins > (shiftStartMins + (settings.late_grace_period || 15));
            if (isLate) {
                todaysLateMinutes = Math.max(0, checkInMins - shiftStartMins);
            }
            const evalRes = (0, calculationService_1.evaluateCheckOut)(emp.todays_check_in, checkOutTime, isLate, todaysLateMinutes, settings);
            todaysWorkedHours = evalRes.workedHours;
            todaysPaidHours = evalRes.paidHours;
            todaysLunchDeduction = evalRes.lunchDeductionHours;
            isEarlyDeparture = evalRes.isEarlyDeparture;
            const dailyCalc = (0, calculationService_1.calculateDailySalary)(monthlySalary, todaysWorkedHours, todaysPaidHours, evalRes.overtimeHours, settings);
            todaysDailySalary = dailyCalc.totalDailyEarnings;
        }
        const enrichedEmployee = {
            ...emp,
            daily_rate: parseFloat(dailyRate.toFixed(2)),
            hourly_rate: parseFloat(hourlyRate.toFixed(2)),
            todays_worked_hours: todaysWorkedHours,
            todays_paid_hours: todaysPaidHours,
            todays_lunch_deduction: todaysLunchDeduction,
            todays_late_minutes: todaysLateMinutes,
            is_late: isLate,
            is_early_departure: isEarlyDeparture,
            todays_daily_salary: todaysDailySalary,
            expected_end_time: settings.shift_end_time || '19:00'
        };
        return res.status(200).json({
            success: true,
            employee: enrichedEmployee
        });
    }
    catch (error) {
        console.error('[Employee Error] Get employee by id failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.getEmployeeById = getEmployeeById;
// Get metadata options for dropdowns (departments, designations, shifts, managers)
const getEmployeeMetaData = async (req, res) => {
    try {
        const depts = await (0, db_1.query)('SELECT id, name FROM departments ORDER BY name ASC');
        const desigs = await (0, db_1.query)('SELECT id, name FROM designations ORDER BY name ASC');
        const shifts = await (0, db_1.query)('SELECT id, name, checkin_start, checkout_time FROM shifts ORDER BY id ASC');
        const managers = await (0, db_1.query)(`SELECT id, full_name, email, role FROM admins WHERE is_active = TRUE ORDER BY full_name ASC`);
        return res.status(200).json({
            success: true,
            departments: depts.rows,
            designations: desigs.rows,
            shifts: shifts.rows,
            managers: managers.rows
        });
    }
    catch (error) {
        console.error('[Employee Meta Error]', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch meta options' });
    }
};
exports.getEmployeeMetaData = getEmployeeMetaData;
