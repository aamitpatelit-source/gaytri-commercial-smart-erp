"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCompanySettings = exports.getCompanySettings = exports.deleteHoliday = exports.createHoliday = exports.getHolidays = exports.deleteShift = exports.updateShift = exports.createShift = exports.getShifts = exports.deleteDesignation = exports.updateDesignation = exports.createDesignation = exports.getDesignations = exports.deleteDepartment = exports.updateDepartment = exports.createDepartment = exports.getDepartments = void 0;
const db_1 = require("../config/db");
// ==========================================
// DEPARTMENTS CRUD
// ==========================================
const getDepartments = async (req, res) => {
    try {
        const result = await (0, db_1.query)('SELECT id, name, created_at FROM departments ORDER BY name ASC');
        return res.status(200).json({ success: true, departments: result.rows });
    }
    catch (error) {
        console.error('[Company API] Get departments failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.getDepartments = getDepartments;
const createDepartment = async (req, res) => {
    const { name } = req.body;
    if (!name || name.trim() === '') {
        return res.status(400).json({ success: false, message: 'Department name is required.' });
    }
    try {
        const existing = await (0, db_1.query)('SELECT id FROM departments WHERE name = $1', [name.trim()]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Department name already exists.' });
        }
        const result = await (0, db_1.query)('INSERT INTO departments (name) VALUES ($1) RETURNING id, name, created_at', [name.trim()]);
        return res.status(201).json({ success: true, message: 'Department created successfully.', department: result.rows[0] });
    }
    catch (error) {
        console.error('[Company API] Create department failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.createDepartment = createDepartment;
const updateDepartment = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || name.trim() === '') {
        return res.status(400).json({ success: false, message: 'Department name is required.' });
    }
    try {
        const check = await (0, db_1.query)('SELECT id FROM departments WHERE id = $1', [id]);
        if (check.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Department not found.' });
        }
        const existingName = await (0, db_1.query)('SELECT id FROM departments WHERE name = $1 AND id != $2', [name.trim(), id]);
        if (existingName.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Department name is already in use.' });
        }
        await (0, db_1.query)('UPDATE departments SET name = $1 WHERE id = $2', [name.trim(), id]);
        return res.status(200).json({ success: true, message: 'Department updated successfully.' });
    }
    catch (error) {
        console.error('[Company API] Update department failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.updateDepartment = updateDepartment;
const deleteDepartment = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await (0, db_1.query)('DELETE FROM departments WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Department not found.' });
        }
        return res.status(200).json({ success: true, message: 'Department deleted successfully.' });
    }
    catch (error) {
        console.error('[Company API] Delete department failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.deleteDepartment = deleteDepartment;
// ==========================================
// DESIGNATIONS CRUD
// ==========================================
const getDesignations = async (req, res) => {
    try {
        const result = await (0, db_1.query)('SELECT id, name, created_at FROM designations ORDER BY name ASC');
        return res.status(200).json({ success: true, designations: result.rows });
    }
    catch (error) {
        console.error('[Company API] Get designations failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.getDesignations = getDesignations;
const createDesignation = async (req, res) => {
    const { name } = req.body;
    if (!name || name.trim() === '') {
        return res.status(400).json({ success: false, message: 'Designation name is required.' });
    }
    try {
        const existing = await (0, db_1.query)('SELECT id FROM designations WHERE name = $1', [name.trim()]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Designation name already exists.' });
        }
        const result = await (0, db_1.query)('INSERT INTO designations (name) VALUES ($1) RETURNING id, name, created_at', [name.trim()]);
        return res.status(201).json({ success: true, message: 'Designation created successfully.', designation: result.rows[0] });
    }
    catch (error) {
        console.error('[Company API] Create designation failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.createDesignation = createDesignation;
const updateDesignation = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || name.trim() === '') {
        return res.status(400).json({ success: false, message: 'Designation name is required.' });
    }
    try {
        const check = await (0, db_1.query)('SELECT id FROM designations WHERE id = $1', [id]);
        if (check.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Designation not found.' });
        }
        const existingName = await (0, db_1.query)('SELECT id FROM designations WHERE name = $1 AND id != $2', [name.trim(), id]);
        if (existingName.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Designation name is already in use.' });
        }
        await (0, db_1.query)('UPDATE designations SET name = $1 WHERE id = $2', [name.trim(), id]);
        return res.status(200).json({ success: true, message: 'Designation updated successfully.' });
    }
    catch (error) {
        console.error('[Company API] Update designation failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.updateDesignation = updateDesignation;
const deleteDesignation = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await (0, db_1.query)('DELETE FROM designations WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Designation not found.' });
        }
        return res.status(200).json({ success: true, message: 'Designation deleted successfully.' });
    }
    catch (error) {
        console.error('[Company API] Delete designation failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.deleteDesignation = deleteDesignation;
// ==========================================
// SHIFTS CRUD
// ==========================================
const getShifts = async (req, res) => {
    try {
        const result = await (0, db_1.query)('SELECT id, name, checkin_start, late_after, half_day_after, checkout_time, working_hours, created_at FROM shifts ORDER BY name ASC');
        return res.status(200).json({ success: true, shifts: result.rows });
    }
    catch (error) {
        console.error('[Company API] Get shifts failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.getShifts = getShifts;
const createShift = async (req, res) => {
    const { name, checkin_start, late_after, half_day_after, checkout_time, working_hours } = req.body;
    if (!name || !checkin_start || !late_after || !half_day_after || !checkout_time) {
        return res.status(400).json({ success: false, message: 'All shift fields are required (name, checkin_start, late_after, half_day_after, checkout_time).' });
    }
    try {
        const existing = await (0, db_1.query)('SELECT id FROM shifts WHERE name = $1', [name.trim()]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Shift name already exists.' });
        }
        const hours = working_hours ? Number(working_hours) : 8.00;
        const result = await (0, db_1.query)(`INSERT INTO shifts (name, checkin_start, late_after, half_day_after, checkout_time, working_hours)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`, [name.trim(), checkin_start, late_after, half_day_after, checkout_time, hours]);
        return res.status(201).json({ success: true, message: 'Shift created successfully.', shift: result.rows[0] });
    }
    catch (error) {
        console.error('[Company API] Create shift failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.createShift = createShift;
const updateShift = async (req, res) => {
    const { id } = req.params;
    const { name, checkin_start, late_after, half_day_after, checkout_time, working_hours } = req.body;
    if (!name || !checkin_start || !late_after || !half_day_after || !checkout_time) {
        return res.status(400).json({ success: false, message: 'All shift fields are required.' });
    }
    try {
        const check = await (0, db_1.query)('SELECT id FROM shifts WHERE id = $1', [id]);
        if (check.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Shift not found.' });
        }
        const hours = working_hours ? Number(working_hours) : 8.00;
        await (0, db_1.query)(`UPDATE shifts 
       SET name = $1, checkin_start = $2, late_after = $3, half_day_after = $4, checkout_time = $5, working_hours = $6, updated_at = NOW()
       WHERE id = $7`, [name.trim(), checkin_start, late_after, half_day_after, checkout_time, hours, id]);
        return res.status(200).json({ success: true, message: 'Shift updated successfully.' });
    }
    catch (error) {
        console.error('[Company API] Update shift failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.updateShift = updateShift;
const deleteShift = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await (0, db_1.query)('DELETE FROM shifts WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Shift not found.' });
        }
        return res.status(200).json({ success: true, message: 'Shift deleted successfully.' });
    }
    catch (error) {
        console.error('[Company API] Delete shift failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.deleteShift = deleteShift;
// ==========================================
// HOLIDAY CALENDAR CRUD
// ==========================================
const getHolidays = async (req, res) => {
    try {
        const result = await (0, db_1.query)('SELECT id, name, date FROM holiday_calendar ORDER BY date ASC');
        return res.status(200).json({ success: true, holidays: result.rows });
    }
    catch (error) {
        console.error('[Company API] Get holidays failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.getHolidays = getHolidays;
const createHoliday = async (req, res) => {
    const { name, date } = req.body;
    if (!name || !date) {
        return res.status(400).json({ success: false, message: 'Holiday name and date are required.' });
    }
    try {
        const existing = await (0, db_1.query)('SELECT id FROM holiday_calendar WHERE date = $1', [new Date(date)]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'A holiday is already scheduled on this date.' });
        }
        const result = await (0, db_1.query)('INSERT INTO holiday_calendar (name, date) VALUES ($1, $2) RETURNING id, name, date', [name.trim(), new Date(date)]);
        return res.status(201).json({ success: true, message: 'Holiday created successfully.', holiday: result.rows[0] });
    }
    catch (error) {
        console.error('[Company API] Create holiday failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.createHoliday = createHoliday;
const deleteHoliday = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await (0, db_1.query)('DELETE FROM holiday_calendar WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Holiday not found.' });
        }
        return res.status(200).json({ success: true, message: 'Holiday deleted successfully.' });
    }
    catch (error) {
        console.error('[Company API] Delete holiday failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.deleteHoliday = deleteHoliday;
// ==========================================
// COMPANY SETTINGS GET/PUT
// ==========================================
const getCompanySettings = async (req, res) => {
    try {
        const result = await (0, db_1.query)('SELECT * FROM company_settings LIMIT 1');
        if (result.rows.length === 0) {
            // Seed default if empty
            const insert = await (0, db_1.query)(`INSERT INTO company_settings (company_name, timezone, business_hours_start, business_hours_end)
         VALUES ('Gaytri Commercial Workforce', 'Asia/Kolkata', '09:00:00', '18:00:00')
         RETURNING *`);
            return res.status(200).json({ success: true, settings: insert.rows[0] });
        }
        return res.status(200).json({ success: true, settings: result.rows[0] });
    }
    catch (error) {
        console.error('[Company API] Get settings failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.getCompanySettings = getCompanySettings;
const updateCompanySettings = async (req, res) => {
    const { company_name, address, contact_email, contact_phone, timezone, business_hours_start, business_hours_end } = req.body;
    try {
        const check = await (0, db_1.query)('SELECT id FROM company_settings LIMIT 1');
        let finalQuery = '';
        let params = [];
        if (check.rows.length === 0) {
            finalQuery = `
        INSERT INTO company_settings (company_name, address, contact_email, contact_phone, timezone, business_hours_start, business_hours_end)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
            params = [
                company_name || 'Gaytri Commercial Workforce',
                address || null,
                contact_email || null,
                contact_phone || null,
                timezone || 'Asia/Kolkata',
                business_hours_start || '09:00:00',
                business_hours_end || '18:00:00'
            ];
        }
        else {
            finalQuery = `
        UPDATE company_settings 
        SET company_name = $1, address = $2, contact_email = $3, contact_phone = $4, timezone = $5, 
            business_hours_start = $6, business_hours_end = $7, updated_at = NOW()
        WHERE id = $8
        RETURNING *
      `;
            params = [
                company_name || 'Gaytri Commercial Workforce',
                address || null,
                contact_email || null,
                contact_phone || null,
                timezone || 'Asia/Kolkata',
                business_hours_start || '09:00:00',
                business_hours_end || '18:00:00',
                check.rows[0].id
            ];
        }
        const result = await (0, db_1.query)(finalQuery, params);
        return res.status(200).json({ success: true, message: 'Company settings updated successfully.', settings: result.rows[0] });
    }
    catch (error) {
        console.error('[Company API] Update settings failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.updateCompanySettings = updateCompanySettings;
