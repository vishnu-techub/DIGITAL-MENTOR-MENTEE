/**
 * KSRCE Digital Mentor-Mentee System Typed API Client
 */

export interface ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  errors?: any;
  meta?: { timestamp: string };
}

const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const normalizedApiUrl = rawApiUrl
  ? (rawApiUrl.startsWith('http') ? rawApiUrl : `https://${rawApiUrl}`).replace(/\/$/, '')
  : '';
const API_BASE = (normalizedApiUrl || '') + '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('ksrce_token');
}

export function setAuthToken(token: string) {
  localStorage.setItem('ksrce_token', token);
}

export function removeAuthToken() {
  localStorage.removeItem('ksrce_token');
}

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getAuthToken();
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Institutional API request failed.');
  }

  return data as ApiResponse<T>;
}

export const api = {
  // Authentication
  auth: {
    login: (credentials: { username: string; password: string }) =>
      request<{ token: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    me: () => request('/auth/me'),
    changePassword: (passwords: { currentPassword: string; newPassword: string }) =>
      request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(passwords),
      }),
  },

  // Admin
  admin: {
    getStats: () => request('/admin/dashboard-stats'),
    getDepartments: () => request('/admin/departments'),
    createDepartment: (dept: { code: string; name: string }) =>
      request('/admin/departments', { method: 'POST', body: JSON.stringify(dept) }),
    getBatches: () => request('/admin/batches'),
    createBatch: (batch: { name: string; startYear: number; endYear: number }) =>
      request('/admin/batches', { method: 'POST', body: JSON.stringify(batch) }),
    getFaculty: () => request('/admin/faculty'),
    createFaculty: (fac: any) =>
      request('/admin/faculty', { method: 'POST', body: JSON.stringify(fac) }),
    toggleFacultyStatus: (facultyId: string) =>
      request(`/admin/faculty/${facultyId}/toggle-status`, { method: 'PATCH' }),
    deleteFaculty: (facultyId: string) =>
      request(`/admin/faculty/${facultyId}`, { method: 'DELETE' }),
    getSettings: () => request('/admin/settings'),
    updateSettings: (settings: any) =>
      request('/admin/settings', { method: 'PUT', body: JSON.stringify(settings) }),
    // Mentor Assignment Management
    getMentees: (mentorId: string, params: Record<string, string> = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/admin/mentors/${mentorId}/mentees${q ? `?${q}` : ''}`);
    },
    getStudentsForAssignment: (params: Record<string, string> = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/admin/students${q ? `?${q}` : ''}`);
    },
    assignMentees: (mentorId: string, studentIds: string[]) =>
      request(`/admin/mentors/${mentorId}/assign-mentees`, {
        method: 'POST',
        body: JSON.stringify({ studentIds }),
      }),
    removeAssignment: (assignmentId: string) =>
      request(`/admin/mentor-assignments/${assignmentId}/remove`, { method: 'PATCH' }),
  },


  // Students
  students: {
    list: (params: Record<string, string> = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/students${q ? `?${q}` : ''}`);
    },
    getById: (id: string) => request(`/students/${id}`),
    create: (data: any) =>
      request('/students', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request(`/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateAcademics: (id: string, data: any) =>
      request(`/students/${id}/academics`, { method: 'PUT', body: JSON.stringify(data) }),
    clearArrear: (id: string, data: { subjectCode: string; clearedInSemester: number; originalSemester?: number; remarks?: string }) =>
      request(`/students/${id}/clear-arrear`, { method: 'POST', body: JSON.stringify(data) }),
    completeProfile: (data: any) =>
      request('/students/complete-profile', { method: 'POST', body: JSON.stringify(data) }),
    resetPassword: (id: string, newPassword?: string) =>
      request(`/students/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
    toggleStatus: (id: string) =>
      request(`/students/${id}/toggle-status`, { method: 'PATCH' }),
    delete: (id: string) =>
      request(`/students/${id}`, { method: 'DELETE' }),
  },

  // Mentorship (Assignment & Reassignment History)
  mentorship: {
    assign: (data: { studentId: string; mentorId: string; assignedFrom?: string; reason?: string }) =>
      request('/mentorship/assign', { method: 'POST', body: JSON.stringify(data) }),
    reassign: (data: { studentId: string; newMentorId: string; effectiveDate?: string; reasonForChange: string }) =>
      request('/mentorship/reassign', { method: 'POST', body: JSON.stringify(data) }),
    getHistory: (studentId: string) => request(`/mentorship/history/${studentId}`),
  },

  // Saturday Meetings
  meetings: {
    getSchedule: () => request('/meetings/schedule/current'),
    list: (params: Record<string, string> = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/meetings${q ? `?${q}` : ''}`);
    },
    create: (data: any) =>
      request('/meetings', { method: 'POST', body: JSON.stringify(data) }),
  },

  // Counselling & AI Assistant
  counselling: {
    getByStudent: (studentId: string) => request(`/counselling/${studentId}`),
    create: (data: any) =>
      request('/counselling', { method: 'POST', body: JSON.stringify(data) }),
    getAiSuggestion: (studentId: string, category: string, mentorPrompt: string) =>
      request<{
        category: string;
        mentorPrompt: string;
        challengeObserved: string;
        correctiveAction: string;
        expectedImprovement: string;
        source: string;
      }>(`/mentor/students/${studentId}/counselling/ai-suggestion`, {
        method: 'POST',
        body: JSON.stringify({ category, mentorPrompt }),
      }),
  },

  // Student Certificates & Documents
  documents: {
    upload: (formData: FormData) =>
      request('/documents/upload', {
        method: 'POST',
        body: formData,
      }),
    getByStudent: (studentId: string) =>
      request<any[]>(`/documents/student/${studentId}`),
    delete: (documentId: string) =>
      request(`/documents/${documentId}`, { method: 'DELETE' }),
    verify: (
      documentId: string,
      data: { verificationStatus: 'Pending' | 'Verified' | 'Rejected'; rejectionReason?: string }
    ) =>
      request(`/documents/${documentId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  // Monthly Progress
  progress: {
    getByStudent: (studentId: string) => request(`/progress/${studentId}`),
    create: (data: any) =>
      request('/progress', { method: 'POST', body: JSON.stringify(data) }),
  },

  // Notifications
  notifications: {
    list: () => request<{ notifications: any[]; unreadCount: number }>('/notifications'),
    markRead: (id: string) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
    triggerReminders: (triggerType: string) =>
      request('/notifications/trigger-saturday-reminders', {
        method: 'POST',
        body: JSON.stringify({ triggerType }),
      }),
  },

  // PDF
  pdf: {
    downloadStudentPdf: async (studentId: string, filename?: string) => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/pdf/student/${studentId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error('Could not download student PDF.');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `KSRCE_Mentee_${studentId}_Dossier.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  },

  // Reports
  reports: {
    getDepartmentReport: () => request('/reports/departments'),
    downloadCsv: async () => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/reports/export/csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to export CSV');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'KSRCE_Mentee_Roster.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  },

  // Audit Logs
  audit: {
    list: (params: Record<string, string> = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/audit-logs${q ? `?${q}` : ''}`);
    },
  },

  // Schools Management & Search
  schools: {
    list: (params?: {
      search?: string;
      city?: string;
      district?: string;
      schoolType?: string;
      isActive?: string | boolean;
      page?: number;
      limit?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.append('search', params.search);
      if (params?.city) qs.append('city', params.city);
      if (params?.district) qs.append('district', params.district);
      if (params?.schoolType) qs.append('schoolType', params.schoolType);
      if (params?.isActive !== undefined) qs.append('isActive', String(params.isActive));
      if (params?.page) qs.append('page', String(params.page));
      if (params?.limit) qs.append('limit', String(params.limit));
      return request<{
        schools: any[];
        pagination: { total: number; page: number; limit: number; pages: number };
      }>(`/schools?${qs.toString()}`);
    },
    districts: () => request<string[]>('/schools/districts'),
    stats: () =>
      request<{ total: number; active: number; inactive: number; districtCount: number }>(
        '/schools/stats'
      ),
    getById: (id: string) => request<any>(`/schools/${id}`),
    create: (data: any) =>
      request<any>('/schools', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request<any>(`/schools/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    toggle: (id: string) =>
      request<any>(`/schools/${id}/toggle`, {
        method: 'PATCH',
      }),
    delete: (id: string) =>
      request<any>(`/schools/${id}`, {
        method: 'DELETE',
      }),
  },
};
