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
// Protected status query & self password change/profile update
router.get('/me', auth_1.authenticateToken, (0, errorHandler_1.asyncHandler)(authController_1.getMe));
router.post('/change-password', auth_1.authenticateToken, (0, errorHandler_1.asyncHandler)(authController_1.changePassword));
router.put('/profile', auth_1.authenticateToken, (0, errorHandler_1.asyncHandler)(authController_1.updateProfile));
// Manager Accounts CRUD routes (restricted to SUPER_ADMIN & ADMIN)
router.get('/managers', auth_1.authenticateToken, (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(authController_1.getManagers));
router.post('/managers', auth_1.authenticateToken, (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(authController_1.createManager));
router.put('/managers/:id', auth_1.authenticateToken, (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(authController_1.updateManager));
router.delete('/managers/:id', auth_1.authenticateToken, (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(authController_1.deleteManager));
exports.default = router;
