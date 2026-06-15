-- SQL Database Schema for Gaytri Commercial Face Attendance MVP
-- Targets: PostgreSQL 14+

-- Core Setup
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Managers Table
CREATE TABLE IF NOT EXISTS managers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Admins Table
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(50) DEFAULT 'ADMIN',
    is_active BOOLEAN DEFAULT TRUE,
    must_change_password BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Employees Table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id VARCHAR(50) UNIQUE NOT NULL, -- GC-XXXX
    full_name VARCHAR(150) NOT NULL,
    department VARCHAR(100) DEFAULT 'Production',
    shift VARCHAR(50) DEFAULT 'Morning Shift',
    mobile VARCHAR(20),
    joining_date DATE DEFAULT CURRENT_DATE,
    salary_type VARCHAR(50) DEFAULT 'MONTHLY',
    role VARCHAR(50) DEFAULT 'EMPLOYEE',
    password_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    face_embedding REAL[] CHECK (array_ndims(face_embedding) = 1 AND (array_length(face_embedding, 1) = 128 OR array_length(face_embedding, 1) IS NULL)),
    biometric_embedding TEXT,
    biometric_enrolled BOOLEAN DEFAULT FALSE,
    biometric_enrolled_at TIMESTAMP WITH TIME ZONE,
    profile_photo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Attendance Records Table
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    check_in_time TIME NOT NULL,
    gps_lat DOUBLE PRECISION,
    gps_lng DOUBLE PRECISION,
    device_id VARCHAR(150),
    status VARCHAR(20) CHECK (status IN ('PRESENT', 'LATE', 'ABSENT')) NOT NULL,
    check_out TIMESTAMP,
    checkout_type TEXT,
    working_hours TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, date)
);

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_employees_emp_id ON employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_emp_date ON attendance_records(employee_id, date);

-- Attendance Settings Table
CREATE TABLE IF NOT EXISTS attendance_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_name VARCHAR(100) DEFAULT 'Morning Shift',
    checkin_start TIME DEFAULT '09:00:00',
    late_after TIME DEFAULT '09:15:00',
    checkout_time TIME DEFAULT '17:00:00',
    grace_minutes INTEGER DEFAULT 15,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Biometric Audit Logs Table
CREATE TABLE IF NOT EXISTS biometric_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    similarity_score REAL,
    result VARCHAR(20) CHECK (result IN ('SUCCESS', 'FAILED')),
    device_id VARCHAR(150),
    ip_address VARCHAR(50),
    liveness_status JSONB,
    failure_reason TEXT,
    nonce VARCHAR(100) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Biometric History Table (Archived Embeddings)
CREATE TABLE IF NOT EXISTS biometric_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    biometric_embedding TEXT,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Re-Enrollment Requests Table
CREATE TABLE IF NOT EXISTS re_enrollment_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES admins(id) ON DELETE SET NULL,
    new_embedding TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance & integrity lookup
CREATE INDEX IF NOT EXISTS idx_biometric_audit_logs_nonce ON biometric_audit_logs(nonce);
CREATE INDEX IF NOT EXISTS idx_biometric_audit_logs_emp ON biometric_audit_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_re_enrollment_requests_emp ON re_enrollment_requests(employee_id);

