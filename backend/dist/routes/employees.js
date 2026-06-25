"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const employeeController_1 = require("../controllers/employeeController");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
// Apply auth check
router.use(auth_1.authenticateToken);
router.get('/', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), (0, errorHandler_1.asyncHandler)(employeeController_1.getEmployees));
router.post('/enroll-biometric', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), (0, errorHandler_1.asyncHandler)(employeeController_1.enrollBiometric));
router.post('/', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(employeeController_1.createEmployee));
router.post('/register-face', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(employeeController_1.registerFace));
router.put('/:id', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(employeeController_1.updateEmployee));
router.delete('/:id', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(employeeController_1.deleteEmployee));
router.post('/:id/register-face', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(employeeController_1.registerFace));
// Re-enrollment workflow
router.post('/re-enrollment/request', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), (0, errorHandler_1.asyncHandler)(employeeController_1.requestReEnrollment));
router.post('/re-enrollment/approve/:id', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), (0, errorHandler_1.asyncHandler)(employeeController_1.approveReEnrollment));
router.post('/re-enrollment/reject/:id', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), (0, errorHandler_1.asyncHandler)(employeeController_1.rejectReEnrollment));
exports.default = router;
