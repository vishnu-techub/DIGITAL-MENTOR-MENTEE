-- ============================================================
-- KSRCE DIGITAL MENTOR-MENTEE MANAGEMENT SYSTEM
-- Relational Database Schema DDL
-- Enforces Foreign Keys, Auditing, and Data Permanence
-- ============================================================

-- 1. DEPARTMENTS
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. BATCHES
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  start_year INTEGER NOT NULL,
  end_year INTEGER NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. USERS (Authentication & Role Credentials)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'HOD', 'FACULTY', 'STUDENT')),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. FACULTY / MENTORS
CREATE TABLE IF NOT EXISTS faculty (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id TEXT UNIQUE NOT NULL,
  designation TEXT NOT NULL,
  cabin_location TEXT,
  phone_number TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. STUDENTS / MENTEES (Permanent Master Record)
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  register_number TEXT UNIQUE NOT NULL,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  department_id TEXT NOT NULL REFERENCES departments(id),
  batch_id TEXT NOT NULL REFERENCES batches(id),
  dob TEXT,
  blood_group TEXT,
  residential_type TEXT CHECK(residential_type IN ('HOSTELLER', 'DAY_SCHOLAR')),
  mobile_number TEXT,
  email TEXT UNIQUE,
  address TEXT,
  profile_completed INTEGER DEFAULT 0,
  profile_completed_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. PARENT DETAILS (Belongs to Student)
CREATE TABLE IF NOT EXISTS parent_details (
  id TEXT PRIMARY KEY,
  student_id TEXT UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  father_name TEXT,
  father_contact TEXT,
  father_occupation TEXT,
  mother_name TEXT,
  mother_contact TEXT,
  mother_occupation TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. SIBLING DETAILS (Belongs to Student)
CREATE TABLE IF NOT EXISTS sibling_details (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sibling_name TEXT NOT NULL,
  sibling_contact TEXT,
  sibling_occupation TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. ACADEMIC SCHOOL DETAILS (10th, 12th, Cutoff, Scholarship)
CREATE TABLE IF NOT EXISTS academic_school_details (
  id TEXT PRIMARY KEY,
  student_id TEXT UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  tenth_mark REAL,
  tenth_school TEXT,
  twelfth_mark REAL,
  twelfth_school TEXT,
  cutoff_mark REAL,
  admission_type TEXT CHECK(admission_type IN ('COUNSELLING', 'MANAGEMENT', 'LATERAL_ENTRY')),
  scholarship_details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. SEMESTER ACADEMICS (Semesters 1 through 8 Ledger)
CREATE TABLE IF NOT EXISTS semester_academics (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  semester_number INTEGER NOT NULL CHECK(semester_number BETWEEN 1 AND 8),
  cgpa REAL DEFAULT 0.0,
  sgpa REAL DEFAULT 0.0,
  arrears_count INTEGER DEFAULT 0,
  arrears_subjects TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, semester_number)
);

-- 10. MENTOR ASSIGNMENT & REASSIGNMENT HISTORY (Immutable Audit Lineage)
CREATE TABLE IF NOT EXISTS mentor_assignments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  mentor_id TEXT NOT NULL REFERENCES faculty(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  assigned_from TEXT NOT NULL,
  assigned_until TEXT,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'COMPLETED')),
  assigned_by TEXT REFERENCES users(id),
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 11. WEEKLY SATURDAY MEETINGS
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  mentor_id TEXT NOT NULL REFERENCES faculty(id),
  meeting_date TEXT NOT NULL,
  meeting_time TEXT NOT NULL,
  location TEXT NOT NULL,
  attendance_status TEXT NOT NULL CHECK(attendance_status IN ('PRESENT', 'ABSENT', 'ON_DUTY')),
  meeting_status TEXT NOT NULL CHECK(meeting_status IN ('COMPLETED', 'PENDING', 'RESCHEDULED')),
  challenges_discussed TEXT,
  student_feedback TEXT,
  counselling_provided TEXT,
  corrective_action TEXT,
  follow_up_required INTEGER DEFAULT 0,
  follow_up_date TEXT,
  mentor_remarks TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 12. 5-DOMAIN COUNSELLING RECORDS
CREATE TABLE IF NOT EXISTS counselling_records (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  mentor_id TEXT NOT NULL REFERENCES faculty(id),
  session_date TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'Academic',
    'Training & Placement',
    'Extra-Curricular / Co-Curricular',
    'Innovation',
    'Skill Development'
  )),
  challenge_observed TEXT NOT NULL,
  corrective_action TEXT NOT NULL,
  student_feedback TEXT,
  mentor_remarks TEXT,
  student_acknowledgement_status TEXT DEFAULT 'ACKNOWLEDGED',
  mentor_signature_status TEXT DEFAULT 'SIGNED',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 13. MONTHLY PROGRESS RECORDS
CREATE TABLE IF NOT EXISTS monthly_progress (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  mentor_id TEXT NOT NULL REFERENCES faculty(id),
  academic_year TEXT NOT NULL,
  month_name TEXT NOT NULL,
  academic_rating INTEGER CHECK(academic_rating BETWEEN 1 AND 5),
  academic_notes TEXT,
  placement_rating INTEGER CHECK(placement_rating BETWEEN 1 AND 5),
  placement_notes TEXT,
  ec_rating INTEGER CHECK(ec_rating BETWEEN 1 AND 5),
  ec_notes TEXT,
  innovation_rating INTEGER CHECK(innovation_rating BETWEEN 1 AND 5),
  innovation_notes TEXT,
  skill_rating INTEGER CHECK(skill_rating BETWEEN 1 AND 5),
  skill_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 14. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  related_entity TEXT,
  related_entity_id TEXT,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 15. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 16. SYSTEM SETTINGS (Institutional Saturday Configuration)
CREATE TABLE IF NOT EXISTS system_settings (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_by TEXT REFERENCES users(id),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance & rapid query execution
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_students_reg ON students(register_number);
CREATE INDEX IF NOT EXISTS idx_students_dept ON students(department_id);
CREATE INDEX IF NOT EXISTS idx_students_batch ON students(batch_id);
CREATE INDEX IF NOT EXISTS idx_mentor_assignments_student ON mentor_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_mentor_assignments_mentor ON mentor_assignments(mentor_id);
CREATE INDEX IF NOT EXISTS idx_mentor_assignments_status ON mentor_assignments(status);
CREATE INDEX IF NOT EXISTS idx_meetings_student ON meetings(student_id);
CREATE INDEX IF NOT EXISTS idx_meetings_mentor ON meetings(mentor_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_counselling_student ON counselling_records(student_id);
CREATE INDEX IF NOT EXISTS idx_monthly_progress_student ON monthly_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
