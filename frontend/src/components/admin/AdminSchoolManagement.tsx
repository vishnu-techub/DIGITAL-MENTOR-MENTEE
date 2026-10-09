import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { PageHeader } from '../common/PageHeader';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Power,
  RefreshCw,
  MapPin,
  CheckCircle,
  XCircle,
  Building,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface SchoolData {
  _id: string;
  schoolName: string;
  city: string;
  district: string;
  state: string;
  schoolType: string;
  schoolCode?: string;
  pincode?: string;
  displayName: string;
  isActive: boolean;
  createdAt: string;
}

export const AdminSchoolManagement: React.FC = () => {
  const [schools, setSchools] = useState<SchoolData[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, districtCount: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState<SchoolData | null>(null);
  const [formData, setFormData] = useState({
    schoolName: '',
    city: '',
    district: '',
    state: 'Tamil Nadu',
    schoolType: 'Government',
    pincode: '',
    schoolCode: '',
    isActive: true,
  });
  const [saving, setSaving] = useState(false);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Load districts and stats on mount
  useEffect(() => {
    loadDistrictsAndStats();
  }, []);

  const loadDistrictsAndStats = async () => {
    try {
      const [distRes, statsRes] = await Promise.all([
        api.schools.districts().catch(() => ({ data: [] })),
        api.schools.stats().catch(() => ({ data: { total: 0, active: 0, inactive: 0, districtCount: 0 } })),
      ]);
      setDistricts(distRes.data || []);
      setStats(statsRes.data || { total: 0, active: 0, inactive: 0, districtCount: 0 });
    } catch (err: any) {
      console.error('Failed to load initial school data:', err);
    }
  };

  // Fetch schools on filter change
  useEffect(() => {
    loadSchools();
  }, [debouncedSearch, selectedDistrict, selectedStatus, page, limit]);

  const loadSchools = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.schools.list({
        search: debouncedSearch.trim() || undefined,
        district: selectedDistrict || undefined,
        isActive: selectedStatus === 'all' ? 'all' : selectedStatus === 'active',
        page,
        limit,
      });

      setSchools(res.data.schools || []);
      setTotalPages(res.data.pagination.pages || 1);
      setTotalCount(res.data.pagination.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch schools');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingSchool(null);
    setFormData({
      schoolName: '',
      city: '',
      district: districts[0] || 'NAMAKKAL',
      state: 'Tamil Nadu',
      schoolType: 'Government',
      pincode: '',
      schoolCode: '',
      isActive: true,
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (school: SchoolData) => {
    setEditingSchool(school);
    setFormData({
      schoolName: school.schoolName,
      city: school.city,
      district: school.district,
      state: school.state || 'Tamil Nadu',
      schoolType: school.schoolType || 'Other',
      pincode: school.pincode || '',
      schoolCode: school.schoolCode || '',
      isActive: school.isActive,
    });
    setShowModal(true);
  };

  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (editingSchool) {
        await api.schools.update(editingSchool._id, formData);
        setSuccessMsg(`School "${formData.schoolName}" updated successfully.`);
      } else {
        await api.schools.create(formData);
        setSuccessMsg(`School "${formData.schoolName}" created successfully.`);
      }
      setShowModal(false);
      loadSchools();
      loadDistrictsAndStats();
    } catch (err: any) {
      setError(err.message || 'Failed to save school');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (school: SchoolData) => {
    try {
      await api.schools.toggle(school._id);
      setSuccessMsg(`School "${school.schoolName}" ${school.isActive ? 'disabled' : 'activated'}.`);
      loadSchools();
      loadDistrictsAndStats();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle status');
    }
  };

  const handleDeleteSchool = async (school: SchoolData) => {
    if (!window.confirm(`Are you sure you want to delete or deactivate "${school.schoolName}"?`)) {
      return;
    }
    try {
      const res = await api.schools.delete(school._id);
      setSuccessMsg(res.message || `School record handled successfully.`);
      loadSchools();
      loadDistrictsAndStats();
    } catch (err: any) {
      setError(err.message || 'Failed to delete school');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <PageHeader
        eyebrow="Administration"
        title="School Management"
        subtitle="Tamil Nadu Engineering Admissions (TNEA) Official School Database & Management"
        actions={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => {
                loadSchools();
                loadDistrictsAndStats();
              }}
              title="Refresh database records"
            >
              <RefreshCw size={16} /> Refresh
            </button>
            <button className="btn btn-primary" onClick={handleOpenAddModal}>
              <Plus size={16} /> Add School
            </button>
          </>
        }
      />

      {/* Notifications */}
      {successMsg && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--color-success-50)', border: '1px solid var(--color-success-500)', color: '#065f46', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={18} /> {successMsg}
        </div>
      )}
      {error && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--color-danger-50)', border: '1px solid var(--color-danger-500)', color: '#991b1b', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {/* Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-slate-500)', fontWeight: 600, textTransform: 'uppercase' }}>Total Schools</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-slate-900)', marginTop: '0.25rem' }}>
            {stats.total.toLocaleString()}
          </div>
        </div>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600, textTransform: 'uppercase' }}>Active in System</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#16a34a', marginTop: '0.25rem' }}>
            {stats.active.toLocaleString()}
          </div>
        </div>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-danger-500)', fontWeight: 600, textTransform: 'uppercase' }}>Disabled / Inactive</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-danger-500)', marginTop: '0.25rem' }}>
            {stats.inactive.toLocaleString()}
          </div>
        </div>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: 600, textTransform: 'uppercase' }}>Districts Covered</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2563eb', marginTop: '0.25rem' }}>
            {stats.districtCount}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="card" style={{ padding: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-400)' }} />
            <input
              type="text"
              className="form-control"
              style={{ paddingLeft: '2.25rem' }}
              placeholder="Search school name, city, or district..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* District Filter */}
          <div>
            <select
              className="form-control"
              value={selectedDistrict}
              onChange={(e) => {
                setSelectedDistrict(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Districts ({districts.length})</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              className="form-control"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Schools Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: '40%' }}>School Name</th>
                <th>City / Block</th>
                <th>District</th>
                <th>Type</th>
                <th>Pincode</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-slate-500)' }}>
                    Loading schools...
                  </td>
                </tr>
              ) : schools.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-slate-500)' }}>
                    No schools found matching your search criteria.
                  </td>
                </tr>
              ) : (
                schools.map((school) => (
                  <tr key={school._id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--color-slate-900)' }}>{school.schoolName}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--color-slate-500)' }}>{school.displayName}</div>
                    </td>
                    <td>{school.city}</td>
                    <td>
                      <span className="badge" style={{ backgroundColor: 'var(--color-slate-100)', color: 'var(--color-slate-700)' }}>
                        {school.district}
                      </span>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          backgroundColor: school.schoolType?.toLowerCase().includes('govt') ? 'var(--color-navy-100)' : 'var(--color-warning-100)',
                          color: school.schoolType?.toLowerCase().includes('govt') ? '#1e40af' : '#92400e',
                        }}
                      >
                        {school.schoolType || 'Other'}
                      </span>
                    </td>
                    <td>{school.pincode || school.schoolCode || '—'}</td>
                    <td>
                      {school.isActive ? (
                        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle size={12} /> Active
                        </span>
                      ) : (
                        <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <XCircle size={12} /> Disabled
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleOpenEditModal(school)}
                          title="Edit school"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${school.isActive ? 'btn-secondary' : 'btn-primary'}`}
                          onClick={() => handleToggleStatus(school)}
                          title={school.isActive ? 'Disable school' : 'Activate school'}
                        >
                          <Power size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteSchool(school)}
                          title="Delete / Deactivate"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            borderTop: '1px solid var(--color-slate-200)',
            backgroundColor: 'var(--color-slate-50)',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: 'var(--color-slate-500)' }}>
            Showing <strong>{schools.length}</strong> of <strong>{totalCount.toLocaleString()}</strong> schools (Page {page} of {totalPages})
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select
              className="form-control"
              style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
              value={limit}
              onChange={(e) => {
                setLimit(parseInt(e.target.value, 10));
                setPage(1);
              }}
            >
              <option value="20">20 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '540px',
              backgroundColor: '#ffffff',
              borderRadius: '0.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-slate-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-slate-900)' }}>
                {editingSchool ? 'Edit School Details' : 'Add New Institution'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--color-slate-500)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSchool} style={{ padding: '1.25rem' }}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">School Name *</label>
                <input
                  type="text"
                  required
                  className="form-control"
                  placeholder="e.g. Government Higher Secondary School"
                  value={formData.schoolName}
                  onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">City / Block *</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Tiruchengode"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">District *</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Namakkal"
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">School Type</label>
                  <select
                    className="form-control"
                    value={formData.schoolType}
                    onChange={(e) => setFormData({ ...formData, schoolType: e.target.value })}
                  >
                    <option value="Government">Government</option>
                    <option value="Fully Aided">Fully Aided</option>
                    <option value="Partially Aided">Partially Aided</option>
                    <option value="Un-aided">Un-aided</option>
                    <option value="Central Government">Central Government</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Pincode</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 637209"
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  <span>Active in Student Dropdown</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingSchool ? 'Save Changes' : 'Create School'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
