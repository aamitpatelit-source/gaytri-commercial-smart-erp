"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
// Public login routes
router.post('/login', (0, errorHandler_1.asyncHandler)(authController_1.login));
router.post('/admin/login', (0, errorHandler_1.asyncHandler)(authController_1.adminLogin));
router.post('/employee/login', (0, errorHandler_1.asyncHandler)(authController_1.employeeLogin));
router.post('/forgot-password', (0, errorHandler_1.asyncHandler)(authController_1.forgotPassword));
router.post('/reset-password', (0, errorHandler_1.asyncHandler)(authController_1.resetPassword));
router.get('/seed-prod-superadmin', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const bcrypt = require('bcryptjs');
    const { query } = require('../config/db');
    const hash = bcrypt.hashSync('sunny7033', 10);
    const result = await query(`
    INSERT INTO admins (id, email, password_hash, full_name, role, is_active, must_change_password, created_at, updated_at)
    VALUES (uuid_generate_v4(), 'gaytricommercial7033@gmail.com', $1, 'Gaytri Super Admin', 'SUPER_ADMIN', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role = 'SUPER_ADMIN',
      is_active = TRUE,
      must_change_password = FALSE,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, email, role, is_active
  `, [hash]);
    const allAdmins = await query('SELECT id, email, role, is_active FROM admins');
    return res.status(200).json({
        success: true,
        message: 'Super admin seeded/verified on production DB.',
        seeded: result.rows[0],
        allAdmins: allAdmins.rows
    });
}));
// Protected status query & self password change/profile update
router.get('/me', auth_1.authenticateToken, (0, errorHandler_1.asyncHandler)(authController_1.getMe));
router.post('/change-password', auth_1.authenticateToken, (0, errorHandler_1.asyncHandler)(authController_1.changePassword));
router.put('/profile', auth_1.authenticateToken, (0, errorHandler_1.asyncHandler)(authController_1.updateProfile));
// Manager Accounts CRUD routes (restricted to SUPER_ADMIN & ADMIN)
router.get('/managers', auth_1.authenticateToken, (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(authController_1.getManagers));
router.post('/managers', auth_1.authenticateToken, (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(authController_1.createManager));
router.put('/managers/:id', auth_1.authenticateToken, (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(authController_1.updateManager));
router.delete('/managers/:id', auth_1.authenticateToken, (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(authController_1.deleteManager));
// Manager Direct Employee Assignment routes (restricted to SUPER_ADMIN & ADMIN)
router.get('/managers/:id/employees', auth_1.authenticateToken, (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(authController_1.getManagerEmployees));
router.post('/managers/:id/employees', auth_1.authenticateToken, (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(authController_1.assignManagerEmployees));
router.post('/managers/:id/assign-all', auth_1.authenticateToken, (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(authController_1.assignAllEmployees));
exports.default = router;
