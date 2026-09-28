import React from 'react';
import { MentorStudentProfileView, MentorProfileTab } from '../mentor/MentorStudentProfileView';

export type StudentDetailsTab =
  | 'overview'
  | 'personal'
  | 'academic'
  | 'parent'
  | 'family' // alias for parent
  | 'mentor'
  | 'counselling'
  | 'documents'
  | 'meeting'
  | 'progress'
  | 'improvement' // alias for progress
  | 'skills'
  | 'pdf'
  | 'timeline';

interface StudentDetailsViewProps {
  studentId: string;
  onBack?: () => void;
  initialTab?: StudentDetailsTab | string;
}

/**
 * StudentDetailsView
 * Dedicated Institutional View for Mentors, HODs, and Administrators.
 * Strictly separates mentor review from the student's self-service portal.
 */
export const StudentDetailsView: React.FC<StudentDetailsViewProps> = ({
  studentId,
  onBack,
  initialTab = 'overview',
}) => {
  // Normalize tab aliases
  let tabToPass: MentorProfileTab = 'overview';
  if (initialTab === 'family' || initialTab === 'parent') {
    tabToPass = 'parent';
  } else if (initialTab === 'progress' || initialTab === 'improvement' || initialTab === 'skills') {
    tabToPass = 'skills';
  } else if (initialTab === 'timeline' || initialTab === 'mentor') {
    tabToPass = 'mentor';
  } else if (
    initialTab === 'overview' ||
    initialTab === 'personal' ||
    initialTab === 'academic' ||
    initialTab === 'counselling' ||
    initialTab === 'documents' ||
    initialTab === 'meeting'
  ) {
    tabToPass = initialTab as MentorProfileTab;
  }

  return (
    <MentorStudentProfileView
      studentId={studentId}
      onBack={onBack}
      initialTab={tabToPass}
    />
  );
};

export default StudentDetailsView;
