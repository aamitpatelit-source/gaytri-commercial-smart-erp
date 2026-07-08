-- SQL Database Schema for Gaytri Commercial Workforce
-- Targets: PostgreSQL 14+

-- Core Setup
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop lookup tables to ensure clean structure alignment
DROP TABLE IF EXISTS shifts CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS designations CASCADE;
DROP TABLE IF EXISTS attendance_settings CASCADE;

-- Departments Table
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Designations Table
CREATE TABLE IF NOT EXISTS designations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Shifts Table
CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    checkin_start TIME NOT NULL,
    late_after TIME NOT NULL,
    half_day_after TIME NOT NULL,
    checkout_time TIME NOT NULL,
    working_hours DECIMAL(4,2) DEFAULT 8.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Admins Table (Stores SUPER_ADMIN, ADMIN, and MANAGER roles)
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER')) DEFAULT 'MANAGER',
    is_active BOOLEAN DEFAULT TRUE,
    must_change_password BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Manager Department Scope mapping
CREATE TABLE IF NOT EXISTS manager_departments (
    manager_id UUID REFERENCES admins(id) ON DELETE CASCADE,
    department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
    PRIMARY KEY (manager_id, department_id)
);

-- Employees Table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id VARCHAR(50) UNIQUE NOT NULL, -- GC-XXXX
    full_name VARCHAR(150) NOT NULL,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    designation_id INTEGER REFERENCES designations(id) ON DELETE SET NULL,
    shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
    mobile VARCHAR(20),
    joining_date DATE DEFAULT CURRENT_DATE,
    salary_type VARCHAR(50) DEFAULT 'MONTHLY',
    role VARCHAR(50) DEFAULT 'EMPLOYEE',
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    require_password_change BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Self-healing alterations for employees table (for pre-existing databases)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS require_password_change BOOLEAN DEFAULT TRUE;

-- Add foreign key constraints safely if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'employees_department_id_fkey') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'employees_designation_id_fkey') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_designation_id_fkey FOREIGN KEY (designation_id) REFERENCES designations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'employees_shift_id_fkey') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Drop legacy attendance table first if exists to ensure clean structure mapping
DROP TABLE IF EXISTS attendance CASCADE;

-- Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    manager_id UUID REFERENCES admins(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    status VARCHAR(20) CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEKEND', 'WORK_FROM_HOME', 'ON_DUTY', 'VOIDED')) NOT NULL,
    remarks TEXT,
    created_device VARCHAR(150),
    source VARCHAR(50) DEFAULT 'MANAGER_MANUAL',
    is_locked BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, date)
);

-- Legacy Duplicate Conflict Log Table
CREATE TABLE IF NOT EXISTS attendance_migration_conflicts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL,
    date DATE NOT NULL,
    record_preserved_id UUID,
    record_discarded_id UUID,
    preserved_status VARCHAR(20),
    discarded_status VARCHAR(20),
    preserved_time TIME,
    discarded_time TIME,
    resolved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Attendance Audit Logs Table (Immutable & Append-Only)
CREATE TABLE IF NOT EXISTS attendance_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendance_id UUID REFERENCES attendance(id) ON DELETE CASCADE,
    changed_by UUID REFERENCES admins(id) ON DELETE SET NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    old_remarks TEXT,
    new_remarks TEXT,
    reason TEXT NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(50),
    device_id VARCHAR(150)
);

-- Leave Requests Table
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    type VARCHAR(50) CHECK (type IN ('CASUAL', 'SICK', 'PAID', 'UNPAID')) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_by UUID REFERENCES admins(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Leave Balances Table
CREATE TABLE IF NOT EXISTS leave_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE UNIQUE,
    casual_leave INT DEFAULT 12,
    sick_leave INT DEFAULT 12,
    paid_leave INT DEFAULT 12,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Holiday Calendar Table
CREATE TABLE IF NOT EXISTS holiday_calendar (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    date DATE UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Password Reset Tokens Table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_or_id VARCHAR(100) NOT NULL,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Company Settings Table
CREATE TABLE IF NOT EXISTS company_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name VARCHAR(150) DEFAULT 'Gaytri Commercial Workforce',
    address TEXT,
    contact_email VARCHAR(100),
    contact_phone VARCHAR(20),
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    business_hours_start TIME DEFAULT '09:00:00',
    business_hours_end TIME DEFAULT '18:00:00',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- General Audit Logs Table (Immutable & Append-Only)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(100) NOT NULL,
    details TEXT,
    performed_by UUID REFERENCES admins(id) ON DELETE SET NULL,
    performed_by_role VARCHAR(50) NOT NULL,
    ip_address VARCHAR(50),
    device_id VARCHAR(150),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_employees_emp_id ON employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Immutability Triggers
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Updates and deletions on audit logs are strictly prohibited';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_prevent_audit_update
BEFORE UPDATE ON attendance_audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE OR REPLACE TRIGGER trg_prevent_audit_delete
BEFORE DELETE ON attendance_audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE OR REPLACE TRIGGER trg_prevent_general_audit_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE OR REPLACE TRIGGER trg_prevent_general_audit_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();



