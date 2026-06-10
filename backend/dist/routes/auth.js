"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
// Public login route
router.post('/login', (0, errorHandler_1.asyncHandler)(authController_1.login));
// Protected status query
router.get('/me', auth_1.authenticateToken, (0, errorHandler_1.asyncHandler)(authController_1.getMe));
exports.default = router;
