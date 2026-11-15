import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { admissionAPI, ipdNursingAPI } from '../../utils/api';
import socket from '../../utils/socket';
import {
    FiActivity,
    FiSearch,
    FiUser,
    FiCalendar,
    FiMapPin,
    FiClock,
    FiFileText,
    FiPrinter,
    FiRefreshCw,
    FiChevronRight,
    FiDroplet,
    FiShield,
    FiAlertTriangle,
    FiCheckCircle,
    FiEye
} from 'react-icons/fi';
import TPRChartModal from '../../components/ipd/TPRChartModal';
import InpatientClinicalNotesModal from '../../components/ipd/InpatientClinicalNotesModal';
import IPDClinicalChartsModal from '../../components/ipd/IPDClinicalChartsModal';
import ICUChartModal from '../../components/ipd/ICUChartModal';
import './DoctorIPDPatients.css';

const DoctorIPDPatients = () => {
    const navigate = useNavigate();

    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [wardFilter, setWardFilter] = useState('ALL'); // 'ALL' | 'ICU' | 'GENERAL' | 'PRIVATE'

    // Direct modal launchers
    const [tprModal, setTprModal] = useState({ open: false, admission: null });
    const [clinicalNotesModal, setClinicalNotesModal] = useState({ open: false, admission: null });
    const [clinicalChartsModal, setClinicalChartsModal] = useState({ open: false, admission: null, tab: 'progress_notes' });
    const [icuChartModal, setIcuChartModal] = useState({ open: false, admission: null });

    // Fetch active hospitalized IPD patients
    const fetchPatients = useCallback(async (isManual = false) => {
        if (!isManual) setLoading(true);
        else setRefreshing(true);

        try {
            // Try IPD summary first (enriched with medicine due, iv fluid, vitals)
            let loaded = false;
            try {
                const res = await ipdNursingAPI.getDashboardSummary();
                if (res && res.success && Array.isArray(res.patients)) {
                    setPatients(res.patients);
                    loaded = true;
                }
            } catch (err) {
                console.warn('IPD Summary endpoint fallback:', err?.message || err);
            }

            // Fallback: active admissions list
            if (!loaded) {
                const admRes = await admissionAPI.getActiveAdmissions();
                const list = admRes.admissions || admRes.data || [];
                const formatted = list.map(a => {
                    const pt = a.patientId || {};
                    const doc = a.doctorId || {};
                    const wardName = a.ward || a.bedId?.ward || 'General Ward';
                    const bedNum = a.bedNumber || a.bedId?.bedNumber || 'Assigned';
                    const isICU = Boolean(a.isICU || /icu|ccu|nicu|picu/i.test(wardName) || /icu|ccu|nicu|picu/i.test(bedNum));
                    return {
                        admissionId: a._id,
                        admission: a,
                        patientId: pt._id,
                        name: pt.name || 'Admitted Patient',
                        age: pt.age || '',
                        gender: pt.gender || 'Unknown',
                        patientMRN: pt.patientId || pt.mrn || '—',
                        ipdNumber: a.ipdNumber || pt.ipdNumber || '—',
                        ward: wardName,
                        bedNumber: bedNum,
                        isICU,
                        attendingDoctor: doc.name ? `Dr. ${doc.name.replace(/^Dr\.?\s*/i, '')}` : (a.consultant || 'Attending Physician'),
                        diagnosis: a.diagnosis || a.reasonForAdmission || 'Clinical Observation & Inpatient Care',
                        admissionDate: a.admissionDate || a.createdAt,
                        admissionTime: a.admissionTime || '',
                        clinicalStatus: isICU ? 'Critical' : 'Admitted',
                        latestVitals: null,
                        medicineDue: null,
                        ivFluid: null
                    };
                });
                setPatients(formatted);
            }
        } catch (error) {
            console.error('Error fetching IPD patients:', error);
            setPatients([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchPatients();

        // Listen for live IPD events
        const handleLiveUpdate = () => fetchPatients(true);
        socket.on('ipd:order_created', handleLiveUpdate);
        socket.on('ipd:mar_updated', handleLiveUpdate);
        socket.on('ipd:vitals_updated', handleLiveUpdate);
        socket.on('ipd:notes_updated', handleLiveUpdate);

        return () => {
            socket.off('ipd:order_created', handleLiveUpdate);
            socket.off('ipd:mar_updated', handleLiveUpdate);
            socket.off('ipd:vitals_updated', handleLiveUpdate);
            socket.off('ipd:notes_updated', handleLiveUpdate);
        };
    }, [fetchPatients]);

    // Filter patients based on search and ward
    const filteredPatients = useMemo(() => {
        return patients.filter(pt => {
            const matchesSearch = !searchTerm || (
                (pt.name && pt.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (pt.patientMRN && String(pt.patientMRN).toLowerCase().includes(searchTerm.toLowerCase())) ||
                (pt.ipdNumber && String(pt.ipdNumber).toLowerCase().includes(searchTerm.toLowerCase())) ||
                (pt.bedNumber && String(pt.bedNumber).toLowerCase().includes(searchTerm.toLowerCase())) ||
                (pt.ward && pt.ward.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (pt.diagnosis && pt.diagnosis.toLowerCase().includes(searchTerm.toLowerCase()))
            );

            if (!matchesSearch) return false;

            if (wardFilter === 'ICU') {
                return pt.isICU || /icu|ccu|nicu|picu/i.test(pt.ward || '') || /icu|ccu|nicu|picu/i.test(pt.bedNumber || '');
            }
            if (wardFilter === 'GENERAL') {
                return !pt.isICU && !/icu|ccu|nicu|picu|private|deluxe/i.test(pt.ward || '');
            }
            if (wardFilter === 'PRIVATE') {
                return /private|deluxe|semi/i.test(pt.ward || '');
            }

            return true;
        });
    }, [patients, searchTerm, wardFilter]);

    // Metric counts
    const metrics = useMemo(() => {
        const total = patients.length;
        const icu = patients.filter(p => p.isICU || /icu|ccu|nicu|picu/i.test(p.ward || '') || /icu|ccu|nicu|picu/i.test(p.bedNumber || '')).length;
        const general = patients.filter(p => !p.isICU && !/icu|ccu|nicu|picu|private|deluxe/i.test(p.ward || '')).length;
        const privateWards = total - icu - general;
        return { total, icu, general, privateWards };
    }, [patients]);

    const calculateStayDays = (admDate) => {
        if (!admDate) return '1 Day';
        const d = new Date(admDate);
        if (isNaN(d.getTime())) return '1 Day';
        const diffMs = Date.now() - d.getTime();
        const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        return `${days} ${days === 1 ? 'Day' : 'Days'}`;
    };

    return (
        <div className="doc-ipd-container">
            {/* Header Banner */}
            <div className="doc-ipd-header-card">
                <div className="doc-ipd-header-info">
                    <div className="doc-ipd-title-row">
                        <div className="doc-ipd-icon-circle">
                            <FiActivity size={24} />
                        </div>
                        <div>
                            <h1 className="doc-ipd-main-title">IPD Clinical Records & Patient Directory</h1>
                            <p className="doc-ipd-subtitle">
                                Review admitted inpatients, write clinical progress notes, prescribe medications, and inspect official clinical charts (ICU, TPR, Drug Chart, Clinical Notes).
                            </p>
                        </div>
                    </div>
                </div>

                <div className="doc-ipd-header-actions">
                    <button
                        type="button"
                        className="doc-ipd-refresh-btn"
                        onClick={() => fetchPatients(true)}
                        disabled={refreshing}
                        title="Refresh Live Inpatient Records"
                    >
                        <FiRefreshCw className={refreshing ? 'spinning' : ''} />
                        <span>{refreshing ? 'Refreshing...' : 'Live Refresh'}</span>
                    </button>
                </div>
            </div>

            {/* Metric Summary Cards */}
            <div className="doc-ipd-metrics-grid">
                <div className="doc-ipd-metric-card" onClick={() => setWardFilter('ALL')}>
                    <div className="doc-ipd-metric-icon blue">
                        <FiUser size={20} />
                    </div>
                    <div className="doc-ipd-metric-content">
                        <span className="doc-ipd-metric-val">{metrics.total}</span>
                        <span className="doc-ipd-metric-lbl">Total Hospitalized</span>
                    </div>
                </div>

                <div className="doc-ipd-metric-card critical" onClick={() => setWardFilter('ICU')}>
                    <div className="doc-ipd-metric-icon red">
                        <FiActivity size={20} />
                    </div>
                    <div className="doc-ipd-metric-content">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="doc-ipd-metric-val">{metrics.icu}</span>
                            <span className="doc-ipd-mini-badge red">CRITICAL</span>
                        </div>
                        <span className="doc-ipd-metric-lbl">ICU / CCU Patients</span>
                    </div>
                </div>

                <div className="doc-ipd-metric-card" onClick={() => setWardFilter('GENERAL')}>
                    <div className="doc-ipd-metric-icon emerald">
                        <FiMapPin size={20} />
                    </div>
                    <div className="doc-ipd-metric-content">
                        <span className="doc-ipd-metric-val">{metrics.general}</span>
                        <span className="doc-ipd-metric-lbl">General Ward</span>
                    </div>
                </div>

                <div className="doc-ipd-metric-card" onClick={() => setWardFilter('PRIVATE')}>
                    <div className="doc-ipd-metric-icon purple">
                        <FiShield size={20} />
                    </div>
                    <div className="doc-ipd-metric-content">
                        <span className="doc-ipd-metric-val">{metrics.privateWards}</span>
                        <span className="doc-ipd-metric-lbl">Private / Deluxe</span>
                    </div>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="doc-ipd-toolbar">
                <div className="doc-ipd-search-box">
                    <FiSearch className="doc-ipd-search-icon" />
                    <input
                        type="text"
                        placeholder="Search by patient name, MRN, IPD number, bed or diagnosis..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button type="button" className="doc-ipd-clear-search" onClick={() => setSearchTerm('')}>
                            ✕
                        </button>
                    )}
                </div>

                <div className="doc-ipd-ward-tabs">
                    {[
                        { key: 'ALL', label: 'All Wards' },
                        { key: 'ICU', label: '⚡ ICU / CCU' },
                        { key: 'GENERAL', label: 'General Ward' },
                        { key: 'PRIVATE', label: 'Private / Deluxe' }
                    ].map(tab => (
                        <button
                            key={tab.key}
                            type="button"
                            className={`doc-ipd-tab-btn ${wardFilter === tab.key ? 'active' : ''}`}
                            onClick={() => setWardFilter(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Patients List */}
            {loading ? (
                <div className="doc-ipd-loading-state">
                    <FiRefreshCw className="spinning" size={32} />
                    <p>Loading hospitalized IPD patients & clinical data...</p>
                </div>
            ) : filteredPatients.length === 0 ? (
                <div className="doc-ipd-empty-state">
                    <div className="doc-ipd-empty-icon">🏥</div>
                    <h3>No Admitted Patients Found</h3>
                    <p>
                        {searchTerm || wardFilter !== 'ALL'
                            ? 'No patients matched your current filter criteria. Try clearing search or switching wards.'
                            : 'There are currently no patients hospitalized in this hospital tenant.'}
                    </p>
                </div>
            ) : (
                <div className="doc-ipd-patient-grid">
                    {filteredPatients.map(pt => {
                        const isICU = pt.isICU || /icu|ccu|nicu|picu/i.test(pt.ward || '') || /icu|ccu|nicu|picu/i.test(pt.bedNumber || '');
                        return (
                            <div key={pt.admissionId || pt.patientId} className={`doc-ipd-card ${isICU ? 'is-icu-card' : ''}`}>
                                {/* Card Header */}
                                <div className="doc-ipd-card-header">
                                    <div className="doc-ipd-pt-meta">
                                        <div className="doc-ipd-avatar">
                                            {pt.name ? pt.name.slice(0, 2).toUpperCase() : 'PT'}
                                        </div>
                                        <div>
                                            <h3 className="doc-ipd-pt-name">{pt.name}</h3>
                                            <div className="doc-ipd-demographics-row">
                                                <span>{pt.age ? `${pt.age} Y` : ''} {pt.gender || ''}</span>
                                                {pt.patientMRN && pt.patientMRN !== '—' && (
                                                    <span className="doc-ipd-mrn-badge">MRN: {pt.patientMRN}</span>
                                                )}
                                                {pt.ipdNumber && pt.ipdNumber !== '—' && (
                                                    <span className="doc-ipd-ipd-badge">IPD: {pt.ipdNumber}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Location Badges */}
                                    <div className="doc-ipd-location-pills">
                                        <span className={`doc-ipd-ward-pill ${isICU ? 'icu' : ''}`}>
                                            <FiMapPin size={12} /> {pt.ward || 'Ward'}
                                        </span>
                                        <span className={`doc-ipd-bed-pill ${isICU ? 'icu' : ''}`}>
                                            Bed {pt.bedNumber || 'Assigned'}
                                        </span>
                                        {isICU && (
                                            <span className="doc-ipd-icu-badge">
                                                ⚡ ICU PATIENT
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Clinical Highlights */}
                                <div className="doc-ipd-card-body">
                                    <div className="doc-ipd-info-row">
                                        <span className="doc-ipd-lbl">Diagnosis:</span>
                                        <strong className="doc-ipd-val diagnosis-text">{pt.diagnosis || 'Clinical Inpatient Care'}</strong>
                                    </div>

                                    <div className="doc-ipd-info-row">
                                        <span className="doc-ipd-lbl">Attending:</span>
                                        <span className="doc-ipd-val">{pt.attendingDoctor || 'Consultant Physician'}</span>
                                    </div>

                                    <div className="doc-ipd-info-row">
                                        <span className="doc-ipd-lbl">Stay Duration:</span>
                                        <span className="doc-ipd-val">{calculateStayDays(pt.admissionDate)} (Admitted: {new Date(pt.admissionDate).toLocaleDateString('en-GB')})</span>
                                    </div>

                                    {/* Latest Vitals if available */}
                                    {pt.latestVitals && (
                                        <div className="doc-ipd-vitals-strip">
                                            {pt.latestVitals.bp && <span className="doc-ipd-v-pill">BP {pt.latestVitals.bp}</span>}
                                            {pt.latestVitals.pulse && <span className="doc-ipd-v-pill">HR {pt.latestVitals.pulse} bpm</span>}
                                            {pt.latestVitals.spo2 && (
                                                <span className={`doc-ipd-v-pill ${pt.latestVitals.spo2 < 95 ? 'warn' : ''}`}>
                                                    SpO₂ {pt.latestVitals.spo2}%
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Quick Document Launchers Bar */}
                                <div className="doc-ipd-quick-docs-bar">
                                    <button
                                        type="button"
                                        className="doc-ipd-mini-btn"
                                        onClick={() => setTprModal({ open: true, admission: pt.admission || { _id: pt.admissionId, patientId: pt.patientId, ward: pt.ward, bedNumber: pt.bedNumber } })}
                                        title="Bedside TPR Observation Chart"
                                    >
                                        <FiPrinter size={12} /> TPR
                                    </button>
                                    <button
                                        type="button"
                                        className="doc-ipd-mini-btn"
                                        onClick={() => setClinicalChartsModal({ open: true, admission: pt.admission || { _id: pt.admissionId, patientId: pt.patientId }, tab: 'progress_notes' })}
                                        title="Clinical Progress Notes"
                                    >
                                        <FiFileText size={12} /> Progress
                                    </button>
                                    <button
                                        type="button"
                                        className="doc-ipd-mini-btn"
                                        onClick={() => setClinicalChartsModal({ open: true, admission: pt.admission || { _id: pt.admissionId, patientId: pt.patientId }, tab: 'drug_stat_iv' })}
                                        title="Drug Chart (STAT & IV)"
                                    >
                                        <FiDroplet size={12} /> Drug Chart
                                    </button>
                                    <button
                                        type="button"
                                        className="doc-ipd-mini-btn"
                                        onClick={() => setClinicalNotesModal({ open: true, admission: pt.admission || { _id: pt.admissionId, patientId: pt.patientId } })}
                                        title="2-Page In-Patient Clinical Notes"
                                    >
                                        <FiFileText size={12} /> Clinical Notes
                                    </button>
                                    {isICU && (
                                        <button
                                            type="button"
                                            className="doc-ipd-mini-btn icu-btn"
                                            onClick={() => setIcuChartModal({ open: true, admission: pt.admission || { _id: pt.admissionId, patientId: pt.patientId, ward: pt.ward, bedNumber: pt.bedNumber } })}
                                            title="Official 2-Page ICU Daily Observation Chart"
                                        >
                                            <FiActivity size={12} /> ICU Chart
                                        </button>
                                    )}
                                </div>

                                {/* Primary Action: Open Clinical Records */}
                                <div className="doc-ipd-card-footer">
                                    <button
                                        type="button"
                                        className="doc-ipd-open-btn"
                                        onClick={() => navigate(`/doctor/ipd/patient/${pt.admissionId || pt.admission?._id}`)}
                                        title="Open Complete IPD Clinical Records Workspace"
                                    >
                                        <span>Open Clinical Records</span>
                                        <FiChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Direct Clinical Document Modals */}
            <TPRChartModal
                isOpen={tprModal.open}
                onClose={() => setTprModal({ open: false, admission: null })}
                admissionId={tprModal.admission?._id}
                admission={tprModal.admission}
                patient={tprModal.admission?.patientId}
            />

            <InpatientClinicalNotesModal
                isOpen={clinicalNotesModal.open}
                onClose={() => setClinicalNotesModal({ open: false, admission: null })}
                admissionId={clinicalNotesModal.admission?._id}
                admission={clinicalNotesModal.admission}
                patient={clinicalNotesModal.admission?.patientId}
            />

            <IPDClinicalChartsModal
                isOpen={clinicalChartsModal.open}
                onClose={() => setClinicalChartsModal({ open: false, admission: null, tab: 'progress_notes' })}
                admissionId={clinicalChartsModal.admission?._id}
                admission={clinicalChartsModal.admission}
                patient={clinicalChartsModal.admission?.patientId}
                initialTab={clinicalChartsModal.tab}
            />

            <ICUChartModal
                isOpen={icuChartModal.open}
                onClose={() => setIcuChartModal({ open: false, admission: null })}
                admissionId={icuChartModal.admission?._id}
                admission={icuChartModal.admission}
                patient={icuChartModal.admission?.patientId}
            />
        </div>
    );
};

export default DoctorIPDPatients;

