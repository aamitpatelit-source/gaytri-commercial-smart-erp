-- GAYTRI COMMERCIAL ERP PRE-CLEANUP DATABASE BACKUP
-- Backup Date: 2026-07-28T12:33:49.089Z

-- Data for admins
INSERT INTO "admins" ("id", "email", "password_hash", "full_name", "role", "is_active", "must_change_password", "created_at", "updated_at") VALUES ('81d56d76-12a7-4470-ba1a-9a6df5dbf25d', 'aamitpatelit@gmail.com', '$2a$10$q6wxZTmaxp2kFwGZeJ7rG.DEvhTUC7bJaF.dicEXcgpT8aSe6JoOO', 'Amit Kumar', 'ADMIN', true, false, '2026-06-10T18:19:28.322Z', '2026-06-11T09:41:34.051Z') ON CONFLICT DO NOTHING;
INSERT INTO "admins" ("id", "email", "password_hash", "full_name", "role", "is_active", "must_change_password", "created_at", "updated_at") VALUES ('1f13ed9a-3976-4d14-8422-6ebd25c748f3', 'manager@gaytri.com', '$2a$10$7EY7UUxfXhFo0oNsS9J5veW24uUW2ZWiM9PFMW/koNXnBybkBoNgC', 'Workforce Manager', 'MANAGER', true, true, '2026-07-08T12:39:20.443Z', '2026-07-08T12:39:20.443Z') ON CONFLICT DO NOTHING;
INSERT INTO "admins" ("id", "email", "password_hash", "full_name", "role", "is_active", "must_change_password", "created_at", "updated_at") VALUES ('90a7d362-1d91-449b-a297-44e20b1b664c', 'admin@gaytri.com', '$2a$10$nFGWn62lB1JrK1jcKQHo9./AXlVAR4MHzxI0vS6D3lrqKxp1YIQWq', 'Gaytri Admin', 'SUPER_ADMIN', true, false, '2026-06-11T17:12:53.617Z', '2026-06-12T07:29:43.132Z') ON CONFLICT DO NOTHING;
INSERT INTO "admins" ("id", "email", "password_hash", "full_name", "role", "is_active", "must_change_password", "created_at", "updated_at") VALUES ('524a6aff-4aef-4dc9-8211-c2619eb31ff1', 'amit8340@gmail.com', '$2a$10$fKHCUEbPZNq5A0TVxAQVlOx8T0Wt1gui8NGBbwsLbv0VmFSlWpThW', 'Amit', 'MANAGER', true, true, '2026-06-12T07:31:15.928Z', '2026-06-12T07:35:09.017Z') ON CONFLICT DO NOTHING;

-- Data for attendance_audit_logs
INSERT INTO "attendance_audit_logs" ("id", "attendance_id", "changed_by", "old_status", "new_status", "old_remarks", "new_remarks", "reason", "changed_at", "ip_address", "device_id") VALUES ('4393bcd3-eb31-4395-9eae-4044d7d63bab', '64e9502f-1dd5-403c-9c84-4bb8e79ab037', NULL, 'PRESENT', 'LATE', 'Initial marking', 'Updated remarks', 'Testing audit trail', '2026-07-08T09:50:06.871Z', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "attendance_audit_logs" ("id", "attendance_id", "changed_by", "old_status", "new_status", "old_remarks", "new_remarks", "reason", "changed_at", "ip_address", "device_id") VALUES ('dba9b6bf-41dc-450e-8ead-0f5feece2e6c', '1a697cc5-4f29-430d-95c0-8c2d03f7e9bf', NULL, 'PRESENT', 'LATE', 'Initial marking', 'Updated remarks', 'Testing audit trail', '2026-07-08T09:50:39.379Z', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "attendance_audit_logs" ("id", "attendance_id", "changed_by", "old_status", "new_status", "old_remarks", "new_remarks", "reason", "changed_at", "ip_address", "device_id") VALUES ('ef3f7f17-1f08-4598-a610-023dfbd8b112', 'a8b89d98-f743-4feb-bfaa-c93712381f28', NULL, 'PRESENT', 'LATE', 'Initial marking', 'Updated remarks', 'Testing audit trail', '2026-07-08T11:38:54.597Z', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "attendance_audit_logs" ("id", "attendance_id", "changed_by", "old_status", "new_status", "old_remarks", "new_remarks", "reason", "changed_at", "ip_address", "device_id") VALUES ('8a16c57f-0406-45c2-a775-9cb9e502e7b5', 'e788e86a-7f40-4936-b188-5f0cf6fb0b10', NULL, 'PRESENT', 'LATE', 'Initial marking', 'Updated remarks', 'Testing audit trail', '2026-07-08T11:48:31.023Z', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "attendance_audit_logs" ("id", "attendance_id", "changed_by", "old_status", "new_status", "old_remarks", "new_remarks", "reason", "changed_at", "ip_address", "device_id") VALUES ('2e62b180-beb6-4160-966a-41ac6dfe0228', 'cee68514-9357-46b3-b2f0-33bd095c0d35', '524a6aff-4aef-4dc9-8211-c2619eb31ff1', 'PRESENT', 'LEAVE', 'E2E Direct Assignment Validation', 'Leave Approved: CASUAL', 'Automatic leave marking on approval', '2026-07-09T12:16:00.697Z', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "attendance_audit_logs" ("id", "attendance_id", "changed_by", "old_status", "new_status", "old_remarks", "new_remarks", "reason", "changed_at", "ip_address", "device_id") VALUES ('9242a213-fb67-4797-ac94-5f33ab96c544', 'de024ad5-2ed8-4f8a-a7ce-78a39454dd25', '524a6aff-4aef-4dc9-8211-c2619eb31ff1', 'PRESENT', 'LEAVE', 'E2E Direct Assignment Validation', 'Leave Approved: CASUAL', 'Automatic leave marking on approval', '2026-07-09T12:16:24.533Z', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "attendance_audit_logs" ("id", "attendance_id", "changed_by", "old_status", "new_status", "old_remarks", "new_remarks", "reason", "changed_at", "ip_address", "device_id") VALUES ('cd3b9cd9-e83a-4319-a8b9-92ef436a2884', 'efbabd08-cb5e-4a9a-bbc7-76131accb775', NULL, 'PRESENT', 'LATE', 'Initial marking', 'Updated remarks', 'Testing audit trail', '2026-07-21T10:35:09.085Z', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "attendance_audit_logs" ("id", "attendance_id", "changed_by", "old_status", "new_status", "old_remarks", "new_remarks", "reason", "changed_at", "ip_address", "device_id") VALUES ('3928ece8-8f2f-4208-b899-1bf21fac68c8', 'a45d31dd-1353-42e6-ba6d-dfe2cb73b990', NULL, 'PRESENT', 'LATE', 'Initial marking', 'Updated remarks', 'Testing audit trail', '2026-07-27T08:46:49.510Z', NULL, NULL) ON CONFLICT DO NOTHING;

-- Data for departments
INSERT INTO "departments" ("id", "name", "created_at") VALUES (1, 'Production', '2026-07-28T08:36:21.016Z') ON CONFLICT DO NOTHING;

-- Data for designations
INSERT INTO "designations" ("id", "name", "created_at") VALUES (1, 'Worker', '2026-07-28T08:36:21.016Z') ON CONFLICT DO NOTHING;

-- Data for employees
INSERT INTO "employees" ("id", "employee_id", "full_name", "email", "mobile", "address", "joining_date", "department_id", "shift_id", "salary_type", "monthly_salary", "daily_wage", "profile_photo_url", "role", "password_hash", "rfid_tag", "is_active", "created_at", "updated_at", "department", "shift", "require_password_change", "designation_id", "is_deleted", "deleted_at", "profile_image_url") VALUES ('bf812e3f-5f5d-46e6-8b87-5b9b6c1a30ac', 'GC-87', 'Amit Patel', NULL, '8340173685', NULL, '2026-06-10T18:30:00.000Z', 1, 1, 'MONTHLY', '0.00', '0.00', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120', 'EMPLOYEE', '$2a$10$TObpV762gQktKTUl08v5oeTbkqJBOieyRsu6KxoLCEXbK.zANol7O', NULL, true, '2026-06-11T17:40:08.159Z', '2026-06-11T17:40:38.145Z', 'Production', 'Night Shift', true, 1, false, NULL, NULL) ON CONFLICT DO NOTHING;

-- Data for leave_balances
INSERT INTO "leave_balances" ("id", "employee_id", "casual_leave", "sick_leave", "paid_leave", "updated_at") VALUES ('df1f90af-1b63-4f08-ba71-3a083ef0986d', 'bf812e3f-5f5d-46e6-8b87-5b9b6c1a30ac', 6, 12, 12, '2026-07-09T12:13:13.052Z') ON CONFLICT DO NOTHING;

-- Data for leave_requests
INSERT INTO "leave_requests" ("id", "employee_id", "start_date", "end_date", "type", "reason", "status", "approved_by", "approved_at", "remarks", "created_at", "updated_at") VALUES ('c96dbe65-00fb-4391-b3c2-85a7074de14e', 'bf812e3f-5f5d-46e6-8b87-5b9b6c1a30ac', '2026-07-08T18:30:00.000Z', '2026-07-10T18:30:00.000Z', 'CASUAL', 'Direct Assignment Mock Leave', 'APPROVED', '524a6aff-4aef-4dc9-8211-c2619eb31ff1', '2026-07-09T12:16:24.533Z', 'Approved via E2E test', '2026-07-09T12:16:24.521Z', '2026-07-09T12:16:24.521Z') ON CONFLICT DO NOTHING;

-- Data for manager_departments
INSERT INTO "manager_departments" ("manager_id", "department_id") VALUES ('1f13ed9a-3976-4d14-8422-6ebd25c748f3', 1) ON CONFLICT DO NOTHING;

-- Data for manager_employees
INSERT INTO "manager_employees" ("id", "manager_id", "employee_id", "created_at") VALUES ('a1ade3d8-ebdc-4ec9-a507-126beff8b905', '524a6aff-4aef-4dc9-8211-c2619eb31ff1', 'bf812e3f-5f5d-46e6-8b87-5b9b6c1a30ac', '2026-07-09T12:16:24.351Z') ON CONFLICT DO NOTHING;

-- Data for schema_migrations
INSERT INTO "schema_migrations" ("version", "executed_at") VALUES (1, '2026-07-27T12:14:51.699Z') ON CONFLICT DO NOTHING;
INSERT INTO "schema_migrations" ("version", "executed_at") VALUES (2, '2026-07-27T12:14:51.962Z') ON CONFLICT DO NOTHING;
INSERT INTO "schema_migrations" ("version", "executed_at") VALUES (3, '2026-07-28T07:20:57.584Z') ON CONFLICT DO NOTHING;
INSERT INTO "schema_migrations" ("version", "executed_at") VALUES (4, '2026-07-28T10:12:23.338Z') ON CONFLICT DO NOTHING;
INSERT INTO "schema_migrations" ("version", "executed_at") VALUES (5, '2026-07-28T10:47:40.229Z') ON CONFLICT DO NOTHING;

-- Data for shifts
INSERT INTO "shifts" ("id", "name", "checkin_start", "late_after", "half_day_after", "checkout_time", "working_hours", "created_at", "updated_at") VALUES (1, 'Morning Shift', '09:00:00', '09:15:00', '11:00:00', '17:00:00', '8.00', '2026-07-28T08:36:21.016Z', '2026-07-28T08:36:21.016Z') ON CONFLICT DO NOTHING;

