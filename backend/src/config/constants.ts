export const ROLES = {
  ADMIN: 'ADMIN',
  HOD: 'HOD',
  FACULTY: 'FACULTY',
  STUDENT: 'STUDENT',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const COUNSELLING_5_CATEGORIES = [
  'Academic Development',
  'Skill Development',
  'Career Development',
  'Personal Development',
  'Extra-Curricular Activities',
] as const;

export const COUNSELLING_CATEGORIES = {
  ACADEMIC_DEV: 'Academic Development',
  SKILL_DEV: 'Skill Development',
  CAREER_DEV: 'Career Development',
  PERSONAL_DEV: 'Personal Development',
  EXTRA_CURRICULAR: 'Extra-Curricular Activities',
} as const;

export type CounsellingCategory = (typeof COUNSELLING_5_CATEGORIES)[number];

export const ATTENDANCE_STATUS = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  ON_DUTY: 'ON_DUTY',
} as const;

export const MEETING_STATUS = {
  COMPLETED: 'COMPLETED',
  PENDING: 'PENDING',
  RESCHEDULED: 'RESCHEDULED',
} as const;

export const MENTOR_ASSIGNMENT_STATUS = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
} as const;

export const NOTIFICATION_TYPES = {
  MEETING_REMINDER_FRIDAY: 'MEETING_REMINDER_FRIDAY',
  MEETING_TODAY_SATURDAY: 'MEETING_TODAY_SATURDAY',
  PENDING_MEETING_UPDATE: 'PENDING_MEETING_UPDATE',
  MENTOR_ASSIGNMENT: 'MENTOR_ASSIGNMENT',
  SYSTEM_ANNOUNCEMENT: 'SYSTEM_ANNOUNCEMENT',
} as const;

export const INSTITUTION_INFO = {
  NAME: 'K.S.R. College of Engineering (Autonomous)',
  ACCREDITATION: 'Approved by AICTE, New Delhi & Affiliated to Anna University, Chennai',
  LOCATION: 'K.S.R. Kalvi Nagar, Tiruchengode – 637 215, Namakkal District, Tamil Nadu',
  WEBSITE: 'https://ksrce.ac.in/',
  SYSTEM_TITLE: 'Digital Mentor–Mentee Management System',
};
