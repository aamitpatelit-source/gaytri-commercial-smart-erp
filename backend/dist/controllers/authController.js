"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.forgotPassword = exports.employeeLogin = exports.deleteManager = exports.updateManager = exports.createManager = exports.getManagers = exports.updateProfile = exports.changePassword = exports.getMe = exports.adminLogin = exports.login = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("../config/db");
const JWT_SECRET = process.env.JWT_SECRET || 'gaytri_commercial_smart_erp_jwt_secret_2026';
// 1. Mobile App Login (Repurposed to authenticate ONLY MANAGER accounts from the 'admins' table)
const login = async (req, res) => {
    const { employee_id, password } = req.body; // mobile app passes 'employee_id' (which is the email now)
    if (!employee_id || !password) {
        return res.status(400).json({ success: false, message: 'Manager Email and password are required.' });
    }
    try {
        const inputEmail = employee_id.trim().toLowerCase();
        console.log(`[Auth Login] Attempting login for: ${inputEmail}`);
        // Query ONLY the admins table, looking for MANAGER role
        const adminRes = await (0, db_1.query)(`SELECT id, email, password_hash, full_name, role, is_active, must_change_password 
       FROM admins WHERE email = $1`, [inputEmail]);
        if (adminRes.rows.length === 0) {
            console.warn(`[Auth Login] Account not found: ${inputEmail}`);
            return res.status(401).json({ success: false, message: 'Invalid manager credentials.' });
        }
        const admin = adminRes.rows[0];
        console.log(`[Auth Login] Account found. Role detected: ${admin.role}`);
        // Restrict mobile app access to MANAGER roles only
        if (admin.role !== 'MANAGER') {
            console.warn(`[Auth Login] Access denied: role is ${admin.role}, expected MANAGER`);
            return res.status(403).json({ success: false, message: 'Access denied. Manager privileges required.' });
        }
        if (!admin.is_active) {
            console.warn(`[Auth Login] Inactive state check failed: Account is deactivated for ${inputEmail}`);
            return res.status(403).json({ success: false, message: 'Your account has been disabled.' });
        }
        const match = await bcryptjs_1.default.compare(password, admin.password_hash);
        console.log(`[Auth Login] Password match result: ${match}`);
        if (!match) {
            return res.status(401).json({ success: false, message: 'Invalid manager credentials.' });
        }
        const token = jsonwebtoken_1.default.sign({
            id: admin.id,
            email: admin.email,
            role: admin.role,
            must_change_password: admin.must_change_password,
        }, JWT_SECRET, { expiresIn: '30d' });
        console.log(`[Auth Login] JWT generation success for: ${inputEmail}`);
        return res.status(200).json({
            success: true,
            message: 'Manager login successful.',
            token,
            access_token: token,
            refresh_token: token,
            user: {
                id: admin.id,
                employee_id: admin.email,
                full_name: admin.full_name,
                role: admin.role,
                must_change_password: admin.must_change_password,
            },
        });
    }
    catch (error) {
        console.error('[Auth Error] Manager login failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.login = login;
// 2. Web Admin Login (Authenticates SUPER_ADMIN or ADMIN roles from the 'admins' table)
const adminLogin = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    try {
        const adminRes = await (0, db_1.query)('SELECT id, email, password_hash, full_name, role, is_active, must_change_password FROM admins WHERE email = $1', [email.trim().toLowerCase()]);
        if (adminRes.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
        }
        const admin = adminRes.rows[0];
        // Restrict web admin login to SUPER_ADMIN and ADMIN roles only
        if (admin.role !== 'SUPER_ADMIN' && admin.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'Access denied. Administrator privileges required.' });
        }
        if (!admin.is_active) {
            return res.status(403).json({ success: false, message: 'Administrator account has been deactivated.' });
        }
        const match = await bcryptjs_1.default.compare(password, admin.password_hash);
        if (!match) {
            return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
        }
        const token = jsonwebtoken_1.default.sign({
            id: admin.id,
            email: admin.email,
            role: admin.role,
            must_change_password: admin.must_change_password,
        }, JWT_SECRET, { expiresIn: '30d' });
        return res.status(200).json({
            success: true,
            message: 'Admin login successful.',
            token,
            access_token: token,
            refresh_token: token,
            user: {
                id: admin.id,
                employee_id: admin.email,
                full_name: admin.full_name,
                role: admin.role,
                must_change_password: admin.must_change_password,
            },
        });
    }
    catch (error) {
        console.error('[Auth Error] Admin login failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.adminLogin = adminLogin;
// 3. Retrieve Currently Authenticated User Session
const getMe = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }
    try {
        const { id } = req.user;
        const adminRes = await (0, db_1.query)('SELECT id, email, full_name, role, is_active, must_change_password FROM admins WHERE id = $1', [id]);
        if (adminRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User profile not found.' });
        }
        const admin = adminRes.rows[0];
        if (!admin.is_active) {
            return res.status(403).json({ success: false, message: 'Account has been deactivated.' });
        }
        return res.status(200).json({
            success: true,
            user: {
                id: admin.id,
                employee_id: admin.email,
                full_name: admin.full_name,
                role: admin.role,
                must_change_password: admin.must_change_password,
            },
        });
    }
    catch (error) {
        console.error('[Auth Error] Get profile failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.getMe = getMe;
// 4. Change Password for Currently Logged-in User
const changePassword = async (req, res) => {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) {
        return res.status(400).json({ success: false, message: 'Current password and new password are required.' });
    }
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }
    try {
        const { id } = req.user;
        const adminRes = await (0, db_1.query)('SELECT password_hash FROM admins WHERE id = $1', [id]);
        if (adminRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User profile not found.' });
        }
        const admin = adminRes.rows[0];
        const match = await bcryptjs_1.default.compare(old_password, admin.password_hash);
        if (!match) {
            return res.status(400).json({ success: false, message: 'Incorrect current password.' });
        }
        const newHash = await bcryptjs_1.default.hash(new_password, 10);
        await (0, db_1.query)('UPDATE admins SET password_hash = $1, must_change_password = false, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newHash, id]);
        return res.status(200).json({ success: true, message: 'Password updated successfully.' });
    }
    catch (error) {
        console.error('[Auth Error] Change password failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.changePassword = changePassword;
// 5. Update Profile details for currently logged-in Admin User
const updateProfile = async (req, res) => {
    const { full_name, email } = req.body;
    if (!full_name || !email) {
        return res.status(400).json({ success: false, message: 'Full name and email are required.' });
    }
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }
    try {
        const { id } = req.user;
        // Check if email already taken by another user
        const existing = await (0, db_1.query)('SELECT id FROM admins WHERE email = $1 AND id != $2', [email.trim().toLowerCase(), id]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Email address is already in use.' });
        }
        await (0, db_1.query)('UPDATE admins SET full_name = $1, email = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [full_name.trim(), email.trim().toLowerCase(), id]);
        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully.',
            user: {
                id,
                employee_id: email.trim().toLowerCase(),
                full_name: full_name.trim(),
                role: req.user.role,
            }
        });
    }
    catch (error) {
        console.error('[Auth Error] Update profile failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.updateProfile = updateProfile;
// ==========================================
// MANAGER MANAGEMENT CRUD ENDPOINTS (For Admins)
// ==========================================
// Get All Manager/Admin Accounts
const getManagers = async (req, res) => {
    try {
        const managers = await (0, db_1.query)(`SELECT id, email, full_name, role, is_active, must_change_password, created_at 
       FROM admins WHERE id != $1 ORDER BY created_at DESC`, [req.user.id]);
        return res.status(200).json({
            success: true,
            managers: managers.rows
        });
    }
    catch (error) {
        console.error('[Managers API] Failed to fetch managers:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.getManagers = getManagers;
// Create a New Manager/Admin Account
const createManager = async (req, res) => {
    const { full_name, email, password, role } = req.body;
    if (!full_name || !email || !password || !role) {
        return res.status(400).json({ success: false, message: 'All fields (full_name, email, password, role) are required.' });
    }
    const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role assigned.' });
    }
    try {
        const cleanEmail = email.trim().toLowerCase();
        // Check if email already in use
        const checkUser = await (0, db_1.query)('SELECT id FROM admins WHERE email = $1', [cleanEmail]);
        if (checkUser.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Email address is already in use.' });
        }
        const { v4: uuidv4 } = require('uuid');
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const newId = uuidv4();
        await (0, db_1.query)(`INSERT INTO admins (id, email, password_hash, full_name, role, is_active, must_change_password, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [newId, cleanEmail, passwordHash, full_name.trim(), role]);
        return res.status(201).json({
            success: true,
            message: 'Account created successfully.',
            manager: {
                id: newId,
                email: cleanEmail,
                full_name: full_name.trim(),
                role,
                is_active: true,
                must_change_password: true
            }
        });
    }
    catch (error) {
        console.error('[Managers API] Failed to create account:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.createManager = createManager;
// Update Manager/Admin Account (Update properties or Reset Password)
const updateManager = async (req, res) => {
    const { id } = req.params;
    const { full_name, email, role, is_active, password } = req.body;
    try {
        // Check if target account exists
        const checkUser = await (0, db_1.query)('SELECT role FROM admins WHERE id = $1', [id]);
        if (checkUser.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Account not found.' });
        }
        // Check for self-modification restriction
        if (id === req.user.id) {
            return res.status(400).json({ success: false, message: 'Self-modification of status/role not allowed via this panel.' });
        }
        let queryParts = [];
        let queryParams = [];
        let counter = 1;
        if (full_name !== undefined) {
            queryParts.push(`full_name = $${counter++}`);
            queryParams.push(full_name.trim());
        }
        if (email !== undefined) {
            const cleanEmail = email.trim().toLowerCase();
            // Check if email already in use by another account
            const checkEmail = await (0, db_1.query)('SELECT id FROM admins WHERE email = $1 AND id != $2', [cleanEmail, id]);
            if (checkEmail.rows.length > 0) {
                return res.status(400).json({ success: false, message: 'Email address is already in use.' });
            }
            queryParts.push(`email = $${counter++}`);
            queryParams.push(cleanEmail);
        }
        if (role !== undefined) {
            const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ success: false, message: 'Invalid role assigned.' });
            }
            queryParts.push(`role = $${counter++}`);
            queryParams.push(role);
        }
        if (is_active !== undefined) {
            queryParts.push(`is_active = $${counter++}`);
            queryParams.push(!!is_active);
        }
        if (password !== undefined && password.trim() !== '') {
            const passwordHash = await bcryptjs_1.default.hash(password, 10);
            queryParts.push(`password_hash = $${counter++}`);
            queryParams.push(passwordHash);
            // Reset must_change_password flag when password is reset by admin
            queryParts.push(`must_change_password = $${counter++}`);
            queryParams.push(true);
        }
        if (queryParts.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update provided.' });
        }
        queryParts.push(`updated_at = CURRENT_TIMESTAMP`);
        queryParams.push(id);
        const updateQuery = `
      UPDATE admins SET ${queryParts.join(', ')} 
      WHERE id = $${counter}
    `;
        await (0, db_1.query)(updateQuery, queryParams);
        return res.status(200).json({
            success: true,
            message: 'Account updated successfully.'
        });
    }
    catch (error) {
        console.error('[Managers API] Failed to update account:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.updateManager = updateManager;
// Delete Manager/Admin Account
const deleteManager = async (req, res) => {
    const { id } = req.params;
    try {
        if (id === req.user.id) {
            return res.status(400).json({ success: false, message: 'Self-deletion not allowed.' });
        }
        const checkUser = await (0, db_1.query)('SELECT id FROM admins WHERE id = $1', [id]);
        if (checkUser.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Account not found.' });
        }
        await (0, db_1.query)('DELETE FROM admins WHERE id = $1', [id]);
        return res.status(200).json({
            success: true,
            message: 'Account deleted successfully.'
        });
    }
    catch (error) {
        console.error('[Managers API] Failed to delete account:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.deleteManager = deleteManager;
// Employee Login
const employeeLogin = async (req, res) => {
    const { employee_id, password } = req.body;
    if (!employee_id || !password) {
        return res.status(400).json({ success: false, message: 'Employee ID and password are required.' });
    }
    try {
        const empId = employee_id.trim();
        const empRes = await (0, db_1.query)(`SELECT id, employee_id, full_name, mobile, password_hash, is_active, require_password_change 
       FROM employees WHERE employee_id = $1`, [empId]);
        if (empRes.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid employee credentials.' });
        }
        const employee = empRes.rows[0];
        if (!employee.is_active) {
            return res.status(403).json({ success: false, message: 'Your account has been deactivated.' });
        }
        const match = await bcryptjs_1.default.compare(password, employee.password_hash);
        if (!match) {
            return res.status(401).json({ success: false, message: 'Invalid employee credentials.' });
        }
        const token = jsonwebtoken_1.default.sign({
            id: employee.id,
            employee_id: employee.employee_id,
            role: 'EMPLOYEE',
            require_password_change: employee.require_password_change,
        }, JWT_SECRET, { expiresIn: '30d' });
        return res.status(200).json({
            success: true,
            message: 'Employee login successful.',
            token,
            access_token: token,
            user: {
                id: employee.id,
                employee_id: employee.employee_id,
                full_name: employee.full_name,
                role: 'EMPLOYEE',
                require_password_change: employee.require_password_change,
            },
        });
    }
    catch (error) {
        console.error('[Auth Error] Employee login failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.employeeLogin = employeeLogin;
// Forgot Password / Request Activation Token
const forgotPassword = async (req, res) => {
    const { email_or_id } = req.body;
    if (!email_or_id || email_or_id.trim() === '') {
        return res.status(400).json({ success: false, message: 'Email or Employee ID is required.' });
    }
    try {
        const input = email_or_id.trim();
        // Check if employee
        const empRes = await (0, db_1.query)('SELECT id, employee_id FROM employees WHERE employee_id = $1 OR mobile = $1', [input]);
        // Check if admin/manager
        const adminRes = await (0, db_1.query)('SELECT id, email FROM admins WHERE email = $1', [input.toLowerCase()]);
        if (empRes.rows.length === 0 && adminRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Account not found.' });
        }
        const targetEmailOrId = empRes.rows.length > 0 ? empRes.rows[0].employee_id : adminRes.rows[0].email;
        // Generate secure activation token (64 hex characters)
        const crypto = require('crypto');
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry
        // Save hashed token at rest
        await (0, db_1.query)(`INSERT INTO password_reset_tokens (email_or_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`, [targetEmailOrId, tokenHash, expiresAt]);
        console.log(`[Secure Auth] Generated reset/activation token for ${targetEmailOrId}: ${rawToken}`);
        // Return the raw token in the response for direct validation in developer tools/frontend
        return res.status(200).json({
            success: true,
            message: 'Activation/reset token generated successfully.',
            token: rawToken,
            expires_at: expiresAt.toISOString()
        });
    }
    catch (error) {
        console.error('[Auth Error] Forgot password failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.forgotPassword = forgotPassword;
// Reset Password / Activate Account (Consumes Token)
const resetPassword = async (req, res) => {
    const { token, new_password } = req.body;
    if (!token || !new_password || new_password.trim() === '') {
        return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }
    try {
        const crypto = require('crypto');
        const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
        // Retrieve active non-expired token
        const tokenRes = await (0, db_1.query)('SELECT id, email_or_id FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > NOW()', [tokenHash]);
        if (tokenRes.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or expired activation/reset token.' });
        }
        const { email_or_id } = tokenRes.rows[0];
        const passwordHash = await bcryptjs_1.default.hash(new_password, 10);
        await (0, db_1.query)('BEGIN');
        // 1. Delete token to enforce one-time-use constraint
        await (0, db_1.query)('DELETE FROM password_reset_tokens WHERE id = $1', [tokenRes.rows[0].id]);
        // 2. Update employee or admin password
        const empUpdate = await (0, db_1.query)(`UPDATE employees 
       SET password_hash = $1, require_password_change = FALSE, updated_at = NOW() 
       WHERE employee_id = $2 RETURNING id`, [passwordHash, email_or_id]);
        if (empUpdate.rows.length === 0) {
            await (0, db_1.query)(`UPDATE admins 
         SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() 
         WHERE email = $2`, [passwordHash, email_or_id.toLowerCase()]);
        }
        await (0, db_1.query)('COMMIT');
        console.log(`[Secure Auth] Password successfully reset/activated for account: ${email_or_id}`);
        return res.status(200).json({
            success: true,
            message: 'Password updated successfully. You can now login.'
        });
    }
    catch (error) {
        await (0, db_1.query)('ROLLBACK');
        console.error('[Auth Error] Reset password failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.resetPassword = resetPassword;
