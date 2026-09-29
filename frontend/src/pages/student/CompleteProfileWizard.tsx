import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  User,
  Home,
  GraduationCap,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  FileCheck,
} from 'lucide-react';
import { SearchableSchoolDropdown } from '../../components/common/SearchableSchoolDropdown';

interface CompleteProfileWizardProps {
  onCompleted: () => void;
}

export const CompleteProfileWizard: React.FC<CompleteProfileWizardProps> = ({ onCompleted }) => {
  const { user, refreshUser } = useAuth();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    fullName: user?.fullName || '',
    registerNumber: user?.username || '',
    departmentName: user?.dept_name || 'Computer Science and Engineering',
    batchName: user?.student?.batch_name || '2023-2027',
    mobileNumber: '',
    email: user?.email || '',
    dob: '',
    bloodGroup: 'B+ve',
    residentialType: 'DAY_SCHOLAR',
    address: '',
    fatherName: '',
    fatherContact: '',
    fatherOccupation: '',
    motherName: '',
    motherContact: '',
    motherOccupation: '',
    siblingName: '',
    siblingContact: '',
    tenthMark: '',
    tenthSchool: '',
    tenthSchoolId: '',
    twelfthMark: '',
    twelfthSchool: '',
    twelfthSchoolId: '',
    cutoffMark: '',
    admissionType: 'COUNSELLING',
    scholarshipDetails: '',
    year: 2,
    section: 'A',
    lateralEntry: {
      previousCollegeName: '',
      previousCourseDiploma: '',
      previousInstitution: '',
      previousQualificationDetails: '',
      admissionYear: new Date().getFullYear(),
    },
    semesters: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      semesterNumber: n,
      cgpa: '',
      arrearsCount: '0',
      arrearsSubjects: '',
    })),
  });

  useEffect(() => {
    async function loadStudent() {
      try {
        const sid = user?.studentId || user?.username;
        if (!sid) return;
        const res = await api.students.getById(sid);
        if (res.success && res.data) {
          const s = res.data;
          setFormData((prev) => ({
            ...prev,
            fullName: s.full_name || prev.fullName,
            registerNumber: s.register_number || prev.registerNumber,
            departmentName: s.department_name || prev.departmentName,
            batchName: s.batch_name || prev.batchName,
            email: s.email || prev.email,
            mobileNumber: s.mobile_number || '',
            dob: s.dob || '',
            bloodGroup: s.blood_group || 'B+ve',
            residentialType: s.residential_type || 'DAY_SCHOLAR',
            address: s.address || '',
            fatherName: s.parent?.father_name || '',
            fatherContact: s.parent?.father_contact || '',
            fatherOccupation: s.parent?.father_occupation || '',
            motherName: s.parent?.mother_name || '',
            motherContact: s.parent?.mother_contact || '',
            motherOccupation: s.parent?.mother_occupation || '',
            siblingName: s.siblings?.[0]?.sibling_name || '',
            siblingContact: s.siblings?.[0]?.sibling_contact || '',
            tenthMark: s.school?.tenth_mark ? String(s.school.tenth_mark) : '',
            tenthSchool: s.school?.tenth_school || s.school?.tenthSchool || '',
            tenthSchoolId: s.school?.tenth_school_id || s.school?.tenthSchoolId?._id || s.school?.tenthSchoolId || '',
            twelfthMark: s.school?.twelfth_mark ? String(s.school.twelfth_mark) : '',
            twelfthSchool: s.school?.twelfth_school || s.school?.twelfthSchool || '',
            twelfthSchoolId: s.school?.twelfth_school_id || s.school?.twelfthSchoolId?._id || s.school?.twelfthSchoolId || '',
            cutoffMark: s.school?.cutoff_mark ? String(s.school.cutoff_mark) : '',
            admissionType: s.admission_type || s.school?.admission_type || 'COUNSELLING',
            scholarshipDetails: s.school?.scholarship_details || '',
            year: Number(s.year) || 2,
            section: s.section || 'A',
            lateralEntry: {
              previousCollegeName: s.lateral_entry?.previousCollegeName || s.school?.lateral_entry?.previousCollegeName || '',
              previousCourseDiploma: s.lateral_entry?.previousCourseDiploma || s.school?.lateral_entry?.previousCourseDiploma || '',
              previousInstitution: s.lateral_entry?.previousInstitution || s.school?.lateral_entry?.previousInstitution || '',
              previousQualificationDetails: s.lateral_entry?.previousQualificationDetails || s.school?.lateral_entry?.previousQualificationDetails || '',
              admissionYear: s.lateral_entry?.admissionYear || s.school?.lateral_entry?.admissionYear || new Date().getFullYear(),
            },
          }));
        }
      } catch (err) {
        console.error('Failed to pre-load student record:', err);
      }
    }
    loadStudent();
  }, [user]);

  const updateField = (field: string, value: any) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const updateSemester = (index: number, field: string, value: any) => {
    const updated = [...formData.semesters];
    updated[index] = { ...updated[index], [field]: value };
    setFormData((prev) => ({ ...prev, semesters: updated }));
  };

  const validateStep = (step: number): boolean => {
    setError(null);
    if (step === 1) {
      if (!formData.mobileNumber) { setError('Please enter your active mobile number.'); return false; }
      if (!/^[0-9]{10}$/.test(formData.mobileNumber.trim())) {
        setError('Mobile number must be exactly 10 digits without spaces, negatives or symbols.');
        return false;
      }
      if (!formData.dob) { setError('Please enter your date of birth.'); return false; }
      if (!formData.address) { setError('Please enter your permanent address.'); return false; }
    } else if (step === 2) {
      if (!formData.fatherName) { setError("Please enter your father's name."); return false; }
      if (!formData.fatherContact) { setError("Please enter your father's contact number."); return false; }
      if (!formData.motherName) { setError("Please enter your mother's name."); return false; }
    } else if (step === 3) {
      if (!formData.tenthMark) { setError('Please enter your 10th standard mark.'); return false; }
      if (!formData.tenthSchool?.trim() && !formData.tenthSchoolId) { setError('Please select or enter your 10th Standard school name.'); return false; }
      if (!formData.twelfthMark) { setError('Please enter your 12th standard mark.'); return false; }
      if (!formData.twelfthSchool?.trim() && !formData.twelfthSchoolId) { setError('Please select or enter your 12th Standard school name.'); return false; }

      if (formData.admissionType === 'LATERAL_ENTRY') {
        if (!formData.lateralEntry.previousCollegeName?.trim()) {
          setError('Please enter your Previous College / Polytechnic Name for Lateral Entry.');
          return false;
        }
        if (!formData.lateralEntry.previousCourseDiploma?.trim()) {
          setError('Please enter your Previous Course / Diploma for Lateral Entry.');
          return false;
        }
      }

      for (const sem of formData.semesters) {
        if (sem.cgpa !== '' && sem.cgpa !== undefined) {
          const val = parseFloat(sem.cgpa);
          if (isNaN(val) || val < 0.0 || val > 10.0) {
            setError(`Semester ${sem.semesterNumber}: CGPA must be strictly between 0.0 and 10.0`);
            return false;
          }
        }
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((p) => Math.min(4, p + 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    setCurrentStep((p) => Math.max(1, p - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitProfile = async () => {
    setSubmitting(true);
    setError(null);
    const payload = {
      mobileNumber: formData.mobileNumber.trim(),
      dob: formData.dob,
      bloodGroup: formData.bloodGroup,
      residentialType: formData.residentialType,
      address: formData.address,
      year: formData.year,
      section: formData.section.trim().toUpperCase(),
      fatherName: formData.fatherName,
      fatherContact: formData.fatherContact,
      fatherOccupation: formData.fatherOccupation,
      motherName: formData.motherName,
      motherContact: formData.motherContact,
      motherOccupation: formData.motherOccupation,
      siblings: formData.siblingName
        ? [{ name: formData.siblingName, contact: formData.siblingContact }]
        : [],
      tenthMark: formData.tenthMark,
      tenthSchool: formData.tenthSchool,
      tenthSchoolId: formData.tenthSchoolId || null,
      twelfthMark: formData.twelfthMark,
      twelfthSchool: formData.twelfthSchool,
      twelfthSchoolId: formData.twelfthSchoolId || null,
      cutoffMark: formData.cutoffMark,
      admissionType: formData.admissionType,
      scholarshipDetails: formData.scholarshipDetails,
      lateralEntry: formData.admissionType === 'LATERAL_ENTRY' ? formData.lateralEntry : undefined,
      semesters: formData.semesters.map((s) => ({
        semesterNumber: s.semesterNumber,
        cgpa: parseFloat(s.cgpa) || 0,
        arrearsCount: parseInt(s.arrearsCount, 10) || 0,
        arrearsSubjects: s.arrearsSubjects || '',
      })),
    };
    try {
      const res = await api.students.completeProfile(payload);
      if (res.success) { await refreshUser(); onCompleted(); }
      else setError(res.message || 'Failed to submit profile.');
    } catch (err: any) {
      setError(err.message || 'Submission failed. Please check fields and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { num: 1, title: 'Personal', fullTitle: 'Personal Information', icon: <User size={15} /> },
    { num: 2, title: 'Family', fullTitle: 'Family Information', icon: <Home size={15} /> },
    { num: 3, title: 'Academic', fullTitle: 'Academic Information', icon: <GraduationCap size={15} /> },
    { num: 4, title: 'Review', fullTitle: 'Review & Submit', icon: <FileCheck size={15} /> },
  ];

  return (
    <div className="wizard-container">
      {/* ── Header ── */}
      <div className="wizard-banner card">
        <span className="badge badge-warning" style={{ marginBottom: 8 }}>Mandatory First-Time Setup</span>
        <h2 className="wizard-banner-title">Complete Your Student Profile</h2>
        <p className="wizard-banner-sub">
          Welcome to KSRCE! Please enter your complete personal, family, and academic details
          to permanently activate your official digital mentoring record book.
        </p>
      </div>

      {/* ── Stepper ── */}
      <div className="wizard-stepper card">
        {steps.map((s, idx) => (
          <React.Fragment key={s.num}>
            <div className={`wizard-step ${currentStep === s.num ? 'active' : ''} ${currentStep > s.num ? 'done' : ''}`}>
              <div className="wizard-step-circle">
                {currentStep > s.num ? '✓' : s.num}
              </div>
              <span className="wizard-step-label">{s.title}</span>
            </div>
            {idx < steps.length - 1 && <div className="wizard-step-divider" />}
          </React.Fragment>
        ))}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="wizard-error">
          <AlertCircle size={17} /> {error}
        </div>
      )}

      {/* ═══════════════════════════════════════
          STEP 1 — PERSONAL INFORMATION
          ═══════════════════════════════════════ */}
      {currentStep === 1 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><User size={18} /> Step 1: Personal Information</h3>
            <span className="badge badge-primary">Institutional Identity</span>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Student Name</label>
              <input type="text" className="form-control" value={formData.fullName}
                onChange={(e) => updateField('fullName', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Register Number (Permanent ID)</label>
              <input type="text" className="form-control" value={formData.registerNumber}
                disabled style={{ backgroundColor: '#F1F5F9', fontWeight: 700, color: '#0B2545' }} />
              <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Fixed by Central Administration</span>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Department</label>
              <input type="text" className="form-control" value={formData.departmentName}
                disabled style={{ backgroundColor: '#F1F5F9' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Matriculation Batch</label>
              <input type="text" className="form-control" value={formData.batchName}
                disabled style={{ backgroundColor: '#F1F5F9' }} />
            </div>
          </div>

          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label">Mobile Number *</label>
              <input type="tel" className="form-control" placeholder="10-digit mobile number"
                value={formData.mobileNumber} onChange={(e) => updateField('mobileNumber', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Date of Birth *</label>
              <input type="date" className="form-control" value={formData.dob}
                onChange={(e) => updateField('dob', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Blood Group *</label>
              <select className="form-control" value={formData.bloodGroup}
                onChange={(e) => updateField('bloodGroup', e.target.value)}>
                {['A+ve', 'A-ve', 'B+ve', 'B-ve', 'O+ve', 'O-ve', 'AB+ve', 'AB-ve'].map((bg) => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Residential Type</label>
              <select className="form-control" value={formData.residentialType}
                onChange={(e) => updateField('residentialType', e.target.value)}>
                <option value="DAY_SCHOLAR">Day Scholar</option>
                <option value="HOSTELLER">Hosteller</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Email ID</label>
              <input type="email" className="form-control" value={formData.email}
                onChange={(e) => updateField('email', e.target.value)} placeholder="student@ksrce.ac.in" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Permanent Residential Address *</label>
            <textarea className="form-control" rows={3} value={formData.address}
              onChange={(e) => updateField('address', e.target.value)}
              placeholder="Door No, Street Name, Village/City, District, Pincode" />
          </div>

          <div className="wizard-nav-row">
            <div />
            <button className="btn btn-primary" onClick={handleNext}>
              Next: Family Information <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          STEP 2 — FAMILY INFORMATION
          ═══════════════════════════════════════ */}
      {currentStep === 2 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><Home size={18} /> Step 2: Parent &amp; Family Details</h3>
          </div>

          <h4 className="wizard-section-title">Father's Particulars</h4>
          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label">Father Name *</label>
              <input type="text" className="form-control" value={formData.fatherName}
                onChange={(e) => updateField('fatherName', e.target.value)} placeholder="Father's full name" />
            </div>
            <div className="form-group">
              <label className="form-label">Father Contact *</label>
              <input type="tel" className="form-control" value={formData.fatherContact}
                onChange={(e) => updateField('fatherContact', e.target.value)} placeholder="Mobile number" />
            </div>
            <div className="form-group">
              <label className="form-label">Father Occupation</label>
              <input type="text" className="form-control" value={formData.fatherOccupation}
                onChange={(e) => updateField('fatherOccupation', e.target.value)} placeholder="e.g. Agriculture, Business" />
            </div>
          </div>

          <h4 className="wizard-section-title">Mother's Particulars</h4>
          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label">Mother Name *</label>
              <input type="text" className="form-control" value={formData.motherName}
                onChange={(e) => updateField('motherName', e.target.value)} placeholder="Mother's full name" />
            </div>
            <div className="form-group">
              <label className="form-label">Mother Contact</label>
              <input type="tel" className="form-control" value={formData.motherContact}
                onChange={(e) => updateField('motherContact', e.target.value)} placeholder="Mobile number" />
            </div>
            <div className="form-group">
              <label className="form-label">Mother Occupation</label>
              <input type="text" className="form-control" value={formData.motherOccupation}
                onChange={(e) => updateField('motherOccupation', e.target.value)} placeholder="e.g. Homemaker, Teacher" />
            </div>
          </div>

          <h4 className="wizard-section-title">Sibling Particulars <span style={{ fontWeight: 400, color: '#64748B' }}>(Optional)</span></h4>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Sibling Name</label>
              <input type="text" className="form-control" value={formData.siblingName}
                onChange={(e) => updateField('siblingName', e.target.value)} placeholder="Brother/Sister name" />
            </div>
            <div className="form-group">
              <label className="form-label">Sibling Contact</label>
              <input type="tel" className="form-control" value={formData.siblingContact}
                onChange={(e) => updateField('siblingContact', e.target.value)} placeholder="Contact number" />
            </div>
          </div>

          <div className="wizard-nav-row">
            <button className="btn btn-secondary" onClick={handleBack}><ArrowLeft size={16} /> Back</button>
            <button className="btn btn-primary" onClick={handleNext}>Next: Academic Information <ArrowRight size={16} /></button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          STEP 3 — ACADEMIC INFORMATION
          ═══════════════════════════════════════ */}
      {currentStep === 3 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><GraduationCap size={18} /> Step 3: Prior Schooling &amp; Semester Grades</h3>
          </div>

          <h4 className="wizard-section-title">School Education &amp; Cut-off</h4>

          {/* 10th row — stacks on mobile */}
          <div className="school-edu-row">
            <div className="form-group school-mark-col">
              <label className="form-label">10th Mark (out of 500) *</label>
              <input type="number" step="0.1" min="0" max="500" className="form-control"
                value={formData.tenthMark} onChange={(e) => updateField('tenthMark', e.target.value)}
                placeholder="e.g. 475" />
            </div>
            <div className="form-group school-dropdown-col">
              <SearchableSchoolDropdown
                label="10th School Name & City"
                placeholder="Search or select school ▼"
                required
                value={formData.tenthSchoolId}
                initialSchoolName={formData.tenthSchool}
                onChange={(school) => {
                  updateField('tenthSchoolId', school?._id || '');
                  updateField('tenthSchool', school?.displayName || school?.schoolName || '');
                }}
              />
            </div>
          </div>

          {/* 12th row — stacks on mobile */}
          <div className="school-edu-row" style={{ marginBottom: '1.5rem' }}>
            <div className="form-group school-mark-col">
              <label className="form-label">12th Mark (out of 600) *</label>
              <input type="number" step="0.1" min="0" max="600" className="form-control"
                value={formData.twelfthMark} onChange={(e) => updateField('twelfthMark', e.target.value)}
                placeholder="e.g. 560" />
            </div>
            <div className="form-group school-dropdown-col">
              <SearchableSchoolDropdown
                label="12th School Name & City"
                placeholder="Search or select school ▼"
                required
                value={formData.twelfthSchoolId}
                initialSchoolName={formData.twelfthSchool}
                onChange={(school) => {
                  updateField('twelfthSchoolId', school?._id || '');
                  updateField('twelfthSchool', school?.displayName || school?.schoolName || '');
                }}
              />
            </div>
          </div>

          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label">TNEA Cut-off Mark</label>
              <input type="number" step="0.01" className="form-control" value={formData.cutoffMark}
                onChange={(e) => updateField('cutoffMark', e.target.value)} placeholder="e.g. 188.5" />
            </div>
            <div className="form-group">
              <label className="form-label">Admission Type</label>
              <select className="form-control" value={formData.admissionType}
                onChange={(e) => {
                  const newType = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    admissionType: newType,
                    lateralEntry: newType === 'LATERAL_ENTRY' ? prev.lateralEntry : {
                      previousCollegeName: '',
                      previousCourseDiploma: '',
                      previousInstitution: '',
                      previousQualificationDetails: '',
                      admissionYear: new Date().getFullYear(),
                    },
                  }));
                }}>
                <option value="COUNSELLING">Counselling (Govt Quota)</option>
                <option value="MANAGEMENT">Management Quota</option>
                <option value="LATERAL_ENTRY">Lateral Entry</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Scholarship Details</label>
              <input type="text" className="form-control" value={formData.scholarshipDetails}
                onChange={(e) => updateField('scholarshipDetails', e.target.value)} placeholder="e.g. First Graduate / PMSS" />
            </div>
          </div>

          {formData.admissionType === 'LATERAL_ENTRY' && (
            <div
              style={{
                marginTop: '1rem',
                marginBottom: '1.5rem',
                padding: '1.25rem',
                backgroundColor: '#F8FAFC',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
              }}
            >
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0B2545', margin: '0 0 1rem 0' }}>
                Lateral Entry Details
              </h4>
              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label">Previous College Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Polytechnic / College Name"
                    value={formData.lateralEntry.previousCollegeName}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        lateralEntry: { ...formData.lateralEntry, previousCollegeName: e.target.value },
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Previous Course / Diploma *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Diploma in IT / CSE / ECE"
                    value={formData.lateralEntry.previousCourseDiploma}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        lateralEntry: { ...formData.lateralEntry, previousCourseDiploma: e.target.value },
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Previous Institution</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Govt / Govt-Aided / Private Polytechnic"
                    value={formData.lateralEntry.previousInstitution}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        lateralEntry: { ...formData.lateralEntry, previousInstitution: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Previous Qualification Details</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Diploma Aggregate % (e.g. 88.5%)"
                    value={formData.lateralEntry.previousQualificationDetails}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        lateralEntry: { ...formData.lateralEntry, previousQualificationDetails: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Admission Year</label>
                  <input
                    type="number"
                    className="form-control"
                    min={2000}
                    max={2035}
                    value={formData.lateralEntry.admissionYear || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        lateralEntry: { ...formData.lateralEntry, admissionYear: Number(e.target.value) || undefined },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          <h4 className="wizard-section-title">Semesters 1–8 Academic Record</h4>
          <div className="semester-scroll">
            {formData.semesters.map((sem, idx) => (
              <div key={sem.semesterNumber} className="semester-row">
                <div className="semester-label">Semester {sem.semesterNumber < 10 ? `0${sem.semesterNumber}` : sem.semesterNumber}</div>
                <div className="semester-fields">
                  <div>
                    <label className="sem-field-label">CGPA</label>
                    <input type="number" step="0.01" className="form-control" placeholder="0.00"
                      value={sem.cgpa} onChange={(e) => updateSemester(idx, 'cgpa', e.target.value)} />
                  </div>
                  <div>
                    <label className="sem-field-label">Standing Arrears</label>
                    <input type="number" className="form-control" value={sem.arrearsCount}
                      onChange={(e) => updateSemester(idx, 'arrearsCount', e.target.value)} />
                  </div>
                  <div className="sem-subjects-col">
                    <label className="sem-field-label">Arrear Subject Codes</label>
                    <input type="text" className="form-control" placeholder="e.g. CS8301"
                      value={sem.arrearsSubjects} onChange={(e) => updateSemester(idx, 'arrearsSubjects', e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="wizard-nav-row">
            <button className="btn btn-secondary" onClick={handleBack}><ArrowLeft size={16} /> Back</button>
            <button className="btn btn-primary" onClick={handleNext}>Review &amp; Submit <ArrowRight size={16} /></button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          STEP 4 — REVIEW & SUBMIT
          ═══════════════════════════════════════ */}
      {currentStep === 4 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><FileCheck size={18} /> Step 4: Review Your Information</h3>
            <span className="badge badge-warning">Verification Required</span>
          </div>

          <div className="wizard-review-notice">
            Please verify all details carefully before submission. Once submitted, your profile will be permanently locked and ready for official academic mentoring.
          </div>

          <div className="wizard-review-section">
            <h4 className="wizard-review-heading">Personal Particulars</h4>
            <div className="review-grid">
              <div><strong>Name:</strong> {formData.fullName}</div>
              <div><strong>Register Number:</strong> {formData.registerNumber}</div>
              <div><strong>Department:</strong> {formData.departmentName}</div>
              <div><strong>Batch:</strong> {formData.batchName}</div>
              <div><strong>Mobile:</strong> {formData.mobileNumber}</div>
              <div><strong>Email:</strong> {formData.email}</div>
              <div><strong>DOB:</strong> {formData.dob}</div>
              <div><strong>Blood Group:</strong> {formData.bloodGroup}</div>
              <div><strong>Residential:</strong> {formData.residentialType}</div>
              <div className="review-full"><strong>Address:</strong> {formData.address}</div>
            </div>
          </div>

          <div className="wizard-review-section">
            <h4 className="wizard-review-heading">Parent &amp; Family Information</h4>
            <div className="review-grid">
              <div><strong>Father Name:</strong> {formData.fatherName}</div>
              <div><strong>Father Contact:</strong> {formData.fatherContact} {formData.fatherOccupation && `(${formData.fatherOccupation})`}</div>
              <div><strong>Mother Name:</strong> {formData.motherName}</div>
              <div><strong>Mother Contact:</strong> {formData.motherContact} {formData.motherOccupation && `(${formData.motherOccupation})`}</div>
              {formData.siblingName && <div><strong>Sibling:</strong> {formData.siblingName} {formData.siblingContact && `(${formData.siblingContact})`}</div>}
            </div>
          </div>

          <div className="wizard-review-section">
            <h4 className="wizard-review-heading">Academic Particulars</h4>
            <div className="review-grid">
              <div><strong>10th Mark:</strong> {formData.tenthMark}/500</div>
              <div><strong>10th School:</strong> {formData.tenthSchool}</div>
              <div><strong>12th Mark:</strong> {formData.twelfthMark}/600</div>
              <div><strong>12th School:</strong> {formData.twelfthSchool}</div>
              <div><strong>Cut-off:</strong> {formData.cutoffMark} / 200</div>
              <div><strong>Admission Mode:</strong> {formData.admissionType}</div>
              <div><strong>Scholarship:</strong> {formData.scholarshipDetails || 'Nil'}</div>
            </div>
          </div>

          <div className="wizard-nav-row">
            <button className="btn btn-secondary" onClick={handleBack} disabled={submitting}>
              <ArrowLeft size={16} /> Back &amp; Edit
            </button>
            <button
              className="btn"
              onClick={handleSubmitProfile}
              disabled={submitting}
              style={{ backgroundColor: '#059669', color: '#fff', padding: '0.75rem 2rem', fontSize: '0.95rem' }}
            >
              <CheckCircle2 size={18} />
              {submitting ? 'Submitting Profile...' : 'Submit Profile'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
