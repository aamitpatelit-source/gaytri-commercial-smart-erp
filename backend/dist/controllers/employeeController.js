"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEmployee = exports.updateEmployee = exports.createEmployee = exports.getEmployees = void 0;
const db_1 = require("../config/db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// Get all employees
const getEmployees = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    try {
        let queryStr = `
       SELECT e.id, e.employee_id, e.full_name, e.mobile, e.joining_date, e.salary_type, e.role, e.is_active,
              e.require_password_change, e.created_at, e.updated_at,
              d.name as department, d.id as department_id,
              dg.name as designation, dg.id as designation_id,
              s.name as shift, s.id as shift_id
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN designations dg ON e.designation_id = dg.id
       LEFT JOIN shifts s ON e.shift_id = s.id
       WHERE e.is_active = TRUE
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
    const { employee_id, full_name, department_id, designation_id, shift_id, mobile, joining_date, salary_type, password, is_active, } = req.body;
    if (!employee_id || !full_name || !mobile) {
        return res.status(400).json({ success: false, message: 'Missing required information (employee_id, full_name, mobile)' });
    }
    try {
        // Check duplicate employee_id
        const duplicateCheck = await (0, db_1.query)('SELECT id FROM employees WHERE employee_id = $1', [employee_id.trim()]);
        if (duplicateCheck.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Employee ID already exists' });
        }
        const joiningDate = joining_date ? new Date(joining_date) : new Date();
        const salaryType = (salary_type || 'MONTHLY').toUpperCase();
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
        const result = await (0, db_1.query)(`INSERT INTO employees (
        employee_id, full_name, department_id, designation_id, shift_id, mobile,
        joining_date, salary_type, role, password_hash, is_active, require_password_change
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'EMPLOYEE', $9, $10, $11)
       RETURNING id, employee_id, full_name, is_active`, [
            employee_id.trim(),
            full_name.trim(),
            department_id || null,
            designation_id || null,
            shift_id || null,
            mobile.trim(),
            joiningDate,
            salaryType,
            finalHash,
            activeStatus,
            requireChange,
        ]);
        // Create default leave balances for the new employee
        await (0, db_1.query)(`INSERT INTO leave_balances (employee_id, casual_leave, sick_leave, paid_leave)
       VALUES ($1, 12, 12, 12)
       ON CONFLICT (employee_id) DO NOTHING`, [result.rows[0].id]);
        // Log the creation
        await (0, db_1.query)(`INSERT INTO audit_logs (action, details, performed_by, performed_by_role)
       VALUES ('EMPLOYEE_CREATED', $1, $2, $3)`, [`Created employee ${employee_id.trim()} (${full_name.trim()})`, req.user?.id || null, req.user?.role || 'SYSTEM']);
        console.log(`[Employee Info] Created employee: ${employee_id} - UUID: ${result.rows[0].id}`);
        return res.status(201).json({
            success: true,
            message: 'Employee created successfully',
            employee: result.rows[0],
        });
    }
    catch (error) {
        console.error('[Employee Error] Create employee failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
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
            designation_id || null,
            shift_id || null,
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
        // Log the update
        await (0, db_1.query)(`INSERT INTO audit_logs (action, details, performed_by, performed_by_role)
       VALUES ('EMPLOYEE_UPDATED', $1, $2, $3)`, [`Updated employee ${employee.employee_id} (${full_name.trim()})`, req.user?.id || null, req.user?.role || 'SYSTEM']);
        console.log(`[Employee Info] Updated employee: ${id} (${full_name.trim()})`);
        return res.status(200).json({
            success: true,
            message: 'Employee updated successfully',
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
        const result = await (0, db_1.query)('DELETE FROM employees WHERE id = $1 RETURNING id, employee_id, full_name', [id]);
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
