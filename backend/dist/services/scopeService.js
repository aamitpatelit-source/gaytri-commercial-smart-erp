"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getManagedDepartmentIds = void 0;
const db_1 = require("../config/db");
/**
 * Shared utility to resolve managed department IDs for any administrative user.
 * Returns null if the user is SUPER_ADMIN or ADMIN (unrestricted access).
 * Returns number[] of department IDs assigned to the manager.
 */
const getManagedDepartmentIds = async (adminId, role) => {
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
        return null;
    }
    const result = await (0, db_1.query)('SELECT department_id FROM manager_departments WHERE manager_id = $1', [adminId]);
    return result.rows.map(row => row.department_id);
};
exports.getManagedDepartmentIds = getManagedDepartmentIds;
