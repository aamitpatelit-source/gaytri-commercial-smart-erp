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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, date)
);

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_employees_emp_id ON employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_emp_date ON attendance_records(employee_id, date);
