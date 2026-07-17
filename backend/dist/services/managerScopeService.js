"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAssignedEmployees = exports.canManageEmployee = exports.getAssignedEmployeeIds = void 0;
const db_1 = require("../config/db");
/**
 * Shared utility to resolve direct employee assignments for managers.
 */
const getAssignedEmployeeIds = async (managerId) => {
    const result = await (0, db_1.query)('SELECT employee_id FROM manager_employees WHERE manager_id = $1', [managerId]);
    return result.rows.map(row => row.employee_id);
};
exports.getAssignedEmployeeIds = getAssignedEmployeeIds;
const canManageEmployee = async (managerId, employeeId, role) => {
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
        return true;
    }
    const result = await (0, db_1.query)('SELECT 1 FROM manager_employees WHERE manager_id = $1 AND employee_id = $2', [managerId, employeeId]);
    return result.rows.length > 0;
};
exports.canManageEmployee = canManageEmployee;
const getAssignedEmployees = async (managerId) => {
    const result = await (0, db_1.query)(`SELECT e.*, d.name as department, dg.name as designation, s.name as shift
     FROM employees e
     JOIN manager_employees me ON e.id = me.employee_id
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN designations dg ON e.designation_id = dg.id
     LEFT JOIN shifts s ON e.shift_id = s.id
     WHERE me.manager_id = $1 AND e.is_active = TRUE
     ORDER BY e.employee_id ASC`, [managerId]);
    return result.rows;
};
exports.getAssignedEmployees = getAssignedEmployees;
