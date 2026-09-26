
## Centralized Digital Mentor–Mentee Management System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.x-61dafb.svg)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-green.svg)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

A centralized, enterprise-grade Digital Mentor–Mentee Management and Academic Counseling platform tailored for **K.S.R. College of Engineering (Autonomous), Tiruchengode**.

---

## 🏛️ System Features & Capabilities

- **Institutional Authentication & RBAC**:
  - Four distinct roles: `ADMIN`, `HOD`, `FACULTY` (Mentor), and `STUDENT` (Mentee).
  - Environment-based Admin initial account bootstrap with Bcrypt cryptographic hashing.
  - JWT session management with HTTP interceptors.

- **Dynamic Student Admission & School Directory**:
  - Searchable dropdown supporting 80+ feeder higher secondary schools with keyboard navigation and custom input option.
  - Complete 360° student profile management (Personal, Parents/Guardian, HSC/SSLC marks, Feeder school metadata).

- **Academic Ledger & Arrear Clearance Tracking**:
  - Semester-specific historical tracking preserving past semester records (e.g. Sem 4 arrear cleared in Sem 5 remains documented in Sem 4 history, while Sem 5 displays clearance status and current active arrears count as 0).
  - CGPA, GPA, subject credits, and active vs. historical arrear computation.

- **Mentor Assignment & Transition Engine**:
  - Bulk and individual student mentor assignments.
  - Safe mentor reassignment preserving previous mentorship meeting notes and history.

- **Counseling & Mentorship Meetings**:
  - Structured meeting logs with student concerns, mentor recommendations, and parent communication flags.
  - Monthly progress evaluations.

- **Permanent Deletion & Cascade Safety**:
  - Administrative delete option for Student records with atomic cleanup of 8 associated collections (`Student`, `User`, `AcademicRecord`, `MentorAssignment`, `Meeting`, `CounsellingRecord`, `MonthlyProgress`, `StudentDocument`).
  - Administrative delete option for Faculty members with safe termination of active mentorship assignments and release of students for reassignment.
  - Comprehensive immutable Audit Logging (`AuditLog`).

- **Official PDF Dossier Export**:
  - Automated generation of the official **KSRCE Digital Mentor–Mentee Record Book** containing the college crest, student details, academic ledger, and mentor meeting logs.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- MongoDB (Local or MongoDB Atlas)

### Setup & Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/vishnu-techub/DIGITAL-MENTOR-MENTEE-.git
   cd DIGITAL-MENTOR-MENTEE-
   ```

2. **Backend Configuration**:
   ```bash
   cd backend
   npm install
   cp .env.example .env
   ```
   *Edit `.env` with your MongoDB connection string and JWT secret.*

3. **Frontend Configuration**:
   ```bash
   cd ../frontend
   npm install
   ```

4. **Running Locally**:
   - In root directory:
     ```bash
     npm run dev
     ```
   - Or run separately:
     - Backend: `cd backend && npm run dev` (Port 5050)
     - Frontend: `cd frontend && npm run dev` (Port 3000)

---

## 🛡️ Security Note
All environment variables, database credentials, and session secrets are kept out of source control via `.gitignore`.
