"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const companyController_1 = require("../controllers/companyController");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
// Apply authentication check to all routes
router.use(auth_1.authenticateToken);
// Departments
router.get('/departments', (0, errorHandler_1.asyncHandler)(companyController_1.getDepartments));
router.post('/departments', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(companyController_1.createDepartment));
router.put('/departments/:id', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(companyController_1.updateDepartment));
router.delete('/departments/:id', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(companyController_1.deleteDepartment));
// Designations
router.get('/designations', (0, errorHandler_1.asyncHandler)(companyController_1.getDesignations));
router.post('/designations', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(companyController_1.createDesignation));
router.put('/designations/:id', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(companyController_1.updateDesignation));
router.delete('/designations/:id', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(companyController_1.deleteDesignation));
// Shifts
router.get('/shifts', (0, errorHandler_1.asyncHandler)(companyController_1.getShifts));
router.post('/shifts', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(companyController_1.createShift));
router.put('/shifts/:id', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(companyController_1.updateShift));
router.delete('/shifts/:id', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(companyController_1.deleteShift));
// Holidays
router.get('/holidays', (0, errorHandler_1.asyncHandler)(companyController_1.getHolidays));
router.post('/holidays', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(companyController_1.createHoliday));
router.delete('/holidays/:id', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(companyController_1.deleteHoliday));
// Company Settings
router.get('/settings', (0, errorHandler_1.asyncHandler)(companyController_1.getCompanySettings));
router.put('/settings', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(companyController_1.updateCompanySettings));
exports.default = router;
