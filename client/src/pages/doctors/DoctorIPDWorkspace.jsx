import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { admissionAPI, ipdClinicalAPI } from '../../utils/api';
import socket from '../../utils/socket';
import {
    FiArrowLeft,
    FiActivity,
    FiUser,
    FiCalendar,
    FiMapPin,
    FiPrinter,
    FiFileText,
    FiDroplet,
    FiRefreshCw,
    FiAlertCircle
} from 'react-icons/fi';
import DoctorIPDOrdersPanel from '../../components/ipd/DoctorIPDOrdersPanel';
import TPRChartModal from '../../components/ipd/TPRChartModal';
import InpatientClinicalNotesModal from '../../components/ipd/InpatientClinicalNotesModal';
import IPDClinicalChartsModal from '../../components/ipd/IPDClinicalChartsModal';
import ICUChartModal from '../../components/ipd/ICUChartModal';
import IPDWristbandModal from '../../components/ipd/IPDWristbandModal';
import './DoctorIPDWorkspace.css';

const DoctorIPDWorkspace = () => {
    const { admissionId } = useParams();
    const navigate = useNavigate();

    const [admission, setAdmission] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    // Modal state for header quick action buttons
    const [tprModalOpen, setTprModalOpen] = useState(false);
    const [clinicalNotesModalOpen, setClinicalNotesModalOpen] = useState(false);
    const [wristbandModalOpen, setWristbandModalOpen] = useState(false);
    const [clinicalChartsModal, setClinicalChartsModal] = useState({ open: false, tab: 'progress_notes' });
    const [icuChartModalOpen, setIcuChartModalOpen] = useState(false);

    // Mount the chart modal only after a chart action is selected.
    // This guarantees initialTab is applied on every open.
    const openClinicalCharts = (tab) => {
        setClinicalChartsModal({ open: true, tab });
    };

    // Fetch admission details
    const fetchAdmission = useCallback(async (isSilent = false) => {
        if (!admissionId || admissionId === 'undefined') {
            setError('Invalid Admission ID');
            setLoading(false);
            return;
        }

        if (!isSilent) setLoading(true);
        else setRefreshing(true);

        try {
            // First try active admissions list
            let found = null;
            try {
                const res = await admissionAPI.getActiveAdmissions();
                const list = res.admissions || res.data || [];
                found = list.find(a => String(a._id) === String(admissionId));
            } catch (err) {
                console.warn('Active admissions fetch fallback:', err);
            }

            // Fallback: direct admission query
            if (!found) {
                try {
                    const singleRes = await admissionAPI.getAdmissionById(admissionId);
                    found = singleRes.admission || singleRes.data || singleRes;
                } catch (singleErr) {
                    console.warn('Single admission fetch fallback:', singleErr);
                }
            }

            if (found) {
                setAdmission(found);
                setError('');
            } else {
                setError('Inpatient admission record not found.');
            }
        } catch (err) {
            console.error('Failed to load admission:', err);
            setError('Failed to load patient admission record.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [admissionId]);

    useEffect(() => {
        fetchAdmission();

        // Listen for live socket events
        const handleLiveUpdate = () => fetchAdmission(true);
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
    }, [fetchAdmission]);

    const patient = admission?.patientId || {};
    const doctor = admission?.doctorId || {};
    const wardName = admission?.ward || admission?.bedId?.ward || 'General Ward';
    const bedNum = admission?.bedNumber || admission?.bedId?.bedNumber || 'Assigned';
    const isICU = Boolean(
        admission?.isICU ||
        /icu|ccu|nicu|picu/i.test(wardName) ||
        /icu|ccu|nicu|picu/i.test(bedNum)
    );

    const patientName = patient.name || 'Inpatient';
    const ageText = patient.age ? `${patient.age} Y` : '';
    const genderText = patient.gender || patient.sex || '';
    const mrn = patient.patientId || patient.mrn || patient.uhid || '—';
    const ipdNo = admission?.ipdNumber || admission?.admissionNumber || (admission?._id ? String(admission._id).slice(-6).toUpperCase() : (patient.ipdNumber || '—'));
    
    const resolveAttendingDoc = () => {
        const candidate = (doctor && typeof doctor === 'object' && doctor.name)
            || admission?.consultant
            || admission?.attendingDoctor
            || admission?.doctorName
            || admission?.appointmentId?.doctorName
            || (admission?.admittedBy && typeof admission.admittedBy === 'object' && /doctor/i.test(admission.admittedBy.role) ? admission.admittedBy.name : '');
        if (candidate && !/nurse/i.test(candidate)) {
            return /^dr\.?\s*/i.test(candidate) ? candidate : `Dr. ${candidate}`;
        }
        return 'Attending Physician';
    };
    const attendingDoc = resolveAttendingDoc();

    return (
        <div className="doc-ipd-workspace-page">
            {/* Top Navigation & Breadcrumb Bar */}
            <div className="doc-ipd-top-nav">
                <button
                    type="button"
                    className="doc-ipd-back-btn"
                    onClick={() => navigate('/doctor/ipd-patients')}
                    title="Back"
                >
                    <FiArrowLeft /> <span>Back</span>
                </button>

                <div className="doc-ipd-nav-title">
                    <span className="doc-ipd-badge-role">Doctor IPD Workspace</span>
                    <span className="doc-ipd-nav-sep">/</span>
                    <span className="doc-ipd-pt-nav-name">{patientName}</span>
                    <span className="doc-ipd-nav-sep">•</span>
                    <span className="doc-ipd-nav-ipd">IPD: {ipdNo}</span>
                </div>

                <button
                    type="button"
                    className="doc-ipd-nav-refresh-btn"
                    onClick={() => fetchAdmission(true)}
                    disabled={refreshing}
                    title="Live Refresh Records"
                >
                    <FiRefreshCw className={refreshing ? 'spinning' : ''} />
                    <span>{refreshing ? 'Syncing...' : 'Live Sync'}</span>
                </button>
            </div>

            {loading ? (
                <div className="doc-ipd-loading-box">
                    <FiRefreshCw className="spinning" size={32} />
                    <p>Loading patient clinical records & charts...</p>
                </div>
            ) : error ? (
                <div className="doc-ipd-error-box">
                    <FiAlertCircle size={32} />
                    <h3>{error}</h3>
                    <button type="button" className="doc-ipd-retry-btn" onClick={() => fetchAdmission()}>
                        Retry Loading
                    </button>
                </div>
            ) : (
                <>
                    {/* Patient Clinical Identity Header Card */}
                    <div className={`doc-ipd-identity-card ${isICU ? 'is-icu-identity' : ''}`}>
                        <div className="doc-ipd-id-left">
                            <div className="doc-ipd-id-avatar">
                                {patientName ? patientName.slice(0, 2).toUpperCase() : 'PT'}
                            </div>
                            <div className="doc-ipd-id-details">
                                <div className="doc-ipd-id-name-row">
                                    <h1 className="doc-ipd-id-name">{patientName}</h1>
                                    <span className="doc-ipd-live-status-pill admitted">
                                        ● Admitted Inpatient
                                    </span>
                                    {isICU && (
                                        <span className="doc-ipd-live-status-pill icu-critical">
                                            ⚡ ICU CRITICAL CARE
                                        </span>
                                    )}
                                </div>

                                <div className="doc-ipd-id-meta-row">
                                    <span>{ageText} {genderText ? `/ ${genderText}` : ''}</span>
                                    <span className="doc-ipd-tag">MRN: {mrn}</span>
                                    <span className="doc-ipd-tag ipd">IPD: {ipdNo}</span>
                                    <span className={`doc-ipd-tag location ${isICU ? 'icu' : ''}`}>
                                        <FiMapPin size={12} /> {wardName} • Bed {bedNum}
                                    </span>
                                    <span className="doc-ipd-tag doc">Attending: {attendingDoc}</span>
                                </div>
                            </div>
                        </div>

                        {/* Quick Document Action Buttons */}
                        <div className="doc-ipd-id-actions">
                            <button
                                type="button"
                                className="doc-ipd-chart-btn tpr"
                                onClick={() => setWristbandModalOpen(true)}
                                title="Preview or Reprint IPD Patient Wristband"
                                style={{ background: '#f0fdfa', borderColor: '#0d9488', color: '#0f766e' }}
                            >
                                <FiPrinter size={14} />
                                <span>Reprint Wristband</span>
                            </button>

                            <button
                                type="button"
                                className="doc-ipd-chart-btn tpr"
                                onClick={() => setTprModalOpen(true)}
                                title="Open Dynamic Bedside TPR & Vitals Chart"
                            >
                                <FiPrinter size={14} />
                                <span>TPR Chart</span>
                            </button>

                            <button
                                type="button"
                                className="doc-ipd-chart-btn progress"
                                onClick={() => openClinicalCharts('progress_notes')}
                                title="Open 1-Page Official Clinical Progress Notes (NABH Letterhead)"
                            >
                                <FiFileText size={14} />
                                <span>Progress Notes</span>
                            </button>

                            <button
                                type="button"
                                className="doc-ipd-chart-btn clinical"
                                onClick={() => setClinicalNotesModalOpen(true)}
                                title="Open 2-Page Official In-Patient Clinical Notes"
                            >
                                <FiFileText size={14} />
                                <span>Clinical Notes</span>
                            </button>

                            <button
                                type="button"
                                className="doc-ipd-chart-btn drug"
                                onClick={() => openClinicalCharts('drug_stat_iv')}
                                title="Open 2-Page Official Drug Chart (STAT, IV & MAR)"
                            >
                                <FiDroplet size={14} />
                                <span>Drug Chart</span>
                            </button>

                            <button
                                type="button"
                                className={`doc-ipd-chart-btn icu ${isICU ? 'highlighted' : ''}`}
                                onClick={() => setIcuChartModalOpen(true)}
                                title="Open Official 2-Page ICU Daily Observation Chart"
                            >
                                <FiActivity size={14} />
                                <span>{isICU ? '⚡ ICU Chart' : 'ICU Chart'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Integrated Full Doctor IPD Clinical Workspace */}
                    <div className="doc-ipd-workspace-body">
                        <DoctorIPDOrdersPanel
                            admissionId={admissionId}
                            admission={admission}
                            patientId={patient._id || admission.patientId}
                            patient={patient}
                            hideHeaderBanner={true}
                        />
                    </div>

                    {/* Modals */}
                    <TPRChartModal
                        isOpen={tprModalOpen}
                        onClose={() => setTprModalOpen(false)}
                        admissionId={admissionId}
                        admission={admission}
                        patient={patient}
                    />

                    <InpatientClinicalNotesModal
                        isOpen={clinicalNotesModalOpen}
                        onClose={() => setClinicalNotesModalOpen(false)}
                        admissionId={admissionId}
                        admission={admission}
                        patient={patient}
                    />

                    {clinicalChartsModal.open && (
                        <IPDClinicalChartsModal
                            key={`${admissionId}-${clinicalChartsModal.tab}`}
                            isOpen={clinicalChartsModal.open}
                            onClose={() => setClinicalChartsModal(prev => ({ ...prev, open: false }))}
                            admissionId={admissionId}
                            admission={admission}
                            patient={patient}
                            initialTab={clinicalChartsModal.tab}
                        />
                    )}

                    <ICUChartModal
                        isOpen={icuChartModalOpen}
                        onClose={() => setIcuChartModalOpen(false)}
                        admissionId={admissionId}
                        admission={admission}
                        patient={patient}
                    />

                    <IPDWristbandModal
                        isOpen={wristbandModalOpen}
                        onClose={() => setWristbandModalOpen(false)}
                        admissionId={admissionId}
                        admission={admission}
                    />
                </>
            )}
        </div>
    );
};

export default DoctorIPDWorkspace;

