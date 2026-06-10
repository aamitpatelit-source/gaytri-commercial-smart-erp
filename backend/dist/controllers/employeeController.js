"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEmployee = exports.registerFace = exports.updateEmployee = exports.createEmployee = exports.getEmployees = void 0;
const db_1 = require("../config/db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// Get all employees (for directory view)
const getEmployees = async (req, res) => {
    try {
        const result = await (0, db_1.query)(`SELECT id, employee_id, full_name, department, shift, mobile, profile_photo_url,
              face_embedding,
              face_embedding IS NOT NULL as has_face_data
       FROM employees
       ORDER BY employee_id ASC`);
        console.log(`[Roster Info] Fetched ${result.rows.length} employees from database.`);
        return res.status(200).json({
            success: true,
            employees: result.rows,
        });
    }
    catch (error) {
        console.error('[Roster Error] Get employees failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.getEmployees = getEmployees;
// Create a new employee
const createEmployee = async (req, res) => {
    const { employee_id, full_name, department, shift, mobile, profile_photo_url, } = req.body;
    if (!employee_id || !full_name || !department || !shift || !mobile) {
        return res.status(400).json({ success: false, message: 'Missing required information' });
    }
    try {
        // Check duplicate
        const duplicateCheck = await (0, db_1.query)('SELECT id FROM employees WHERE employee_id = $1', [employee_id]);
        if (duplicateCheck.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Employee ID already exists' });
        }
        const joiningDate = req.body.joining_date ? new Date(req.body.joining_date) : new Date();
        const salary_type = (req.body.salary_type || 'MONTHLY').toUpperCase();
        const role = req.body.role || 'EMPLOYEE';
        const passwordHash = bcryptjs_1.default.hashSync(req.body.password || '123456', 10);
        const is_active = req.body.is_active !== undefined ? req.body.is_active : true;
        const result = await (0, db_1.query)(`INSERT INTO employees (
        employee_id, full_name, department, shift, mobile, profile_photo_url,
        joining_date, salary_type, role, password_hash, is_active, created_at, updated_at
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, employee_id, full_name`, [
            employee_id,
            full_name,
            department,
            shift,
            mobile,
            profile_photo_url || null,
            joiningDate,
            salary_type,
            role,
            passwordHash,
            is_active,
            new Date(),
            new Date()
        ]);
        console.log(`[Roster Info] Created new employee profile: ${employee_id} (${full_name}) - UUID: ${result.rows[0].id}`);
        return res.status(201).json({
            success: true,
            message: 'Employee created successfully',
            employee: result.rows[0],
        });
    }
    catch (error) {
        console.error('[Roster Error] Create employee failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.createEmployee = createEmployee;
// Update employee
const updateEmployee = async (req, res) => {
    const { id } = req.params;
    const { full_name, department, shift, mobile, profile_photo_url } = req.body;
    if (!full_name || !department || !shift || !mobile) {
        return res.status(400).json({ success: false, message: 'Missing required information' });
    }
    try {
        const empCheck = await (0, db_1.query)('SELECT id FROM employees WHERE id = $1', [id]);
        if (empCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        await (0, db_1.query)(`UPDATE employees SET
        full_name = $1, department = $2, shift = $3, mobile = $4, profile_photo_url = $5, updated_at = $6
       WHERE id = $7`, [full_name, department, shift, mobile, profile_photo_url || null, new Date(), id]);
        console.log(`[Roster Info] Updated employee profile: ${id} (${full_name})`);
        return res.status(200).json({
            success: true,
            message: 'Employee updated successfully',
        });
    }
    catch (error) {
        console.error('[Roster Error] Update employee failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.updateEmployee = updateEmployee;
// Register face embeddings
const registerFace = async (req, res) => {
    const employeeId = req.params.id || req.body.id || req.body.employee_id;
    const { face_embedding, profile_photo_url } = req.body;
    if (!employeeId) {
        return res.status(400).json({ success: false, message: 'Employee ID is required.' });
    }
    if (!face_embedding || !Array.isArray(face_embedding) || face_embedding.length !== 128) {
        return res.status(400).json({ success: false, message: 'A 128-dimensional face embedding array is required.' });
    }
    try {
        // Check if employee exists by either UUID id or corporate employee_id
        const empCheck = await (0, db_1.query)('SELECT id, employee_id, full_name FROM employees WHERE id::text = $1 OR employee_id = $1', [employeeId]);
        if (empCheck.rows.length === 0) {
            console.warn(`[Biometric Sync] Face enrollment failed: Employee '${employeeId}' not found in database.`);
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        const employee = empCheck.rows[0];
        await (0, db_1.query)(`UPDATE employees 
       SET face_embedding = $1, profile_photo_url = $2, updated_at = $3
       WHERE id = $4`, [face_embedding, profile_photo_url || null, new Date(), employee.id]);
        console.log(`[Biometric Sync] Successfully enrolled face signature for: ${employee.full_name} (${employee.employee_id})`);
        return res.status(200).json({
            success: true,
            message: 'Face signature enrolled successfully.',
            employee: {
                id: employee.id,
                employee_id: employee.employee_id,
                full_name: employee.full_name
            }
        });
    }
    catch (error) {
        console.error('[Biometric Sync Error] Register face failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.registerFace = registerFace;
// Delete employee
const deleteEmployee = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await (0, db_1.query)('DELETE FROM employees WHERE id = $1 RETURNING id, employee_id, full_name', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        const employee = result.rows[0];
        console.log(`[Roster Info] Deleted employee profile: ${employee.full_name} (${employee.employee_id}) - UUID: ${employee.id}`);
        return res.status(200).json({
            success: true,
            message: 'Employee deleted successfully',
        });
    }
    catch (error) {
        console.error('[Roster Error] Delete employee failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.deleteEmployee = deleteEmployee;
