"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const employeeController_1 = require("../controllers/employeeController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Apply auth check
router.use(auth_1.authenticateToken);
router.get('/', (0, auth_1.requireRole)(['ADMIN']), employeeController_1.getEmployees);
router.post('/', (0, auth_1.requireRole)(['ADMIN']), employeeController_1.createEmployee);
router.put('/:id', (0, auth_1.requireRole)(['ADMIN']), employeeController_1.updateEmployee);
router.delete('/:id', (0, auth_1.requireRole)(['ADMIN']), employeeController_1.deleteEmployee);
router.post('/:id/register-face', (0, auth_1.requireRole)(['ADMIN']), employeeController_1.registerFace);
exports.default = router;
