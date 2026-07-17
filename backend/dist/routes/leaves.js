"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const leaveController_1 = require("../controllers/leaveController");
const router = (0, express_1.Router)();
// Apply auth middleware to all leaves routes
router.use(auth_1.authenticateToken);
// Balances
router.get('/balances', leaveController_1.getLeaveBalances);
router.put('/balances/:id', leaveController_1.updateLeaveBalance);
// Requests
router.get('/requests', leaveController_1.getLeaveRequests);
router.post('/requests', leaveController_1.submitLeaveRequest);
router.delete('/requests/:id', leaveController_1.cancelLeaveRequest); // Cancel request
// Actions
router.post('/requests/:id/approve', leaveController_1.approveLeaveRequest);
router.post('/requests/:id/reject', leaveController_1.rejectLeaveRequest);
exports.default = router;
