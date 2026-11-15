import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../store/hooks';
import { useBranding } from '../../context/BrandingContext';
import { ipdClinicalAPI, hospitalAPI, admissionAPI } from '../../utils/api';
import {
    buildICUChartViewModel,
    downloadICUChartPdf,
    printICUChart,
    ICU_CHART_TEMPLATE_PAGE1_URL,
    ICU_CHART_TEMPLATE_PAGE2_URL,
    COMMON_NABH_LOGO_URL
} from '../../utils/icuChartPdf';
import { FiX, FiPrinter, FiDownload, FiActivity, FiCalendar, FiLayers, FiFileText, FiMic } from 'react-icons/fi';
import ClinicalVoiceScribeModal from './ClinicalVoiceScribeModal';
import toast from 'react-hot-toast';
import './ICUChartModal.css';

const toDateInputValue = (dVal) => {
    const d = dVal ? new Date(dVal) : new Date();
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const isValidAdmissionId = (id) => Boolean(id && id !== 'undefined' && id !== 'null' && (typeof id === 'string' ? id.trim().length === 24 : Boolean(id?._id || id?.id)));

const ICUChartModal = ({
    isOpen,
    onClose,
    admissionId,
    admission: initialAdmission,
    patient: initialPatient,
    isBlank = false
}) => {
    const { user } = useAuth();
    const { branding } = useBranding();

    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [admission, setAdmission] = useState(initialAdmission || null);
    const [tenantHospital, setTenantHospital] = useState(null);
    const [icuData, setIcuData] = useState(null);
    const [activeTab, setActiveTab] = useState('page1'); // 'page1' | 'page2' | 'both'
    const [isScribeModalOpen, setIsScribeModalOpen] = useState(false);

    const initialDateVal = useMemo(() => {
        return toDateInputValue(initialAdmission?.admissionDate || new Date());
    }, [initialAdmission?.admissionDate]);

    const [chartDate, setChartDate] = useState(initialDateVal);

    const effectiveAdmissionId = admissionId || initialAdmission?._id || null;

    useEffect(() => {
        setAdmission(initialAdmission || null);
        if (initialAdmission?.admissionDate) {
            setChartDate(toDateInputValue(initialAdmission.admissionDate));
        }
    }, [initialAdmission]);

    // Load ICU Chart Data from backend endpoint
    const loadICUChartData = useCallback(async () => {
        if (!isOpen) return;
        setLoading(true);
        try {
            const brandingPromise = user?.hospitalId
                ? hospitalAPI.getMyBranding().catch(() => null)
                : Promise.resolve(null);

            if (!isValidAdmissionId(effectiveAdmissionId) || isBlank) {
                const brandRes = await brandingPromise;
                if (brandRes?.hospital) setTenantHospital(brandRes.hospital);
                return;
            }

            const [brandRes, icuRes] = await Promise.all([
                brandingPromise,
                ipdClinicalAPI.getICUChart(effectiveAdmissionId).catch((err) => {
                    console.warn('Direct ICU chart endpoint error, falling back:', err);
                    return null;
                })
            ]);

            if (brandRes?.hospital) {
                setTenantHospital(brandRes.hospital);
            }

            if (icuRes?.success && icuRes.data) {
                setIcuData(icuRes.data);
                if (icuRes.data.admission) {
                    setAdmission(icuRes.data.admission);
                }
                if (icuRes.data.hospital) {
                    setTenantHospital(icuRes.data.hospital);
                }
            } else {
                // If endpoint returned empty or failed, fetch admission directly
                const admRes = await admissionAPI.getAdmissionById(effectiveAdmissionId).catch(() => null);
                if (admRes?.admission || admRes?.data) {
                    setAdmission(admRes.admission || admRes.data);
                }
            }
        } catch (err) {
            console.error('Error loading ICU chart:', err);
            toast.error('Could not load complete ICU chart data');
        } finally {
            setLoading(false);
        }
    }, [isOpen, effectiveAdmissionId, isBlank, user?.hospitalId]);

    useEffect(() => {
        if (isOpen) {
            loadICUChartData();
        }
    }, [isOpen, loadICUChartData]);

    // Build View Model strictly adhering to missing data rule
    const viewModel = useMemo(() => {
        return buildICUChartViewModel({
            admission,
            patient: initialPatient,
            hospital: tenantHospital,
            icuData: icuData || {},
            chartDate
        });
    }, [admission, initialPatient, tenantHospital, icuData, chartDate]);

    // Handle PDF Download
    const handleDownload = async () => {
        if (downloading) return;
        setDownloading(true);
        try {
            await downloadICUChartPdf({
                admission,
                patient: initialPatient,
                hospital: tenantHospital,
                icuData: icuData || {},
                chartDate
            });
            toast.success('ICU Daily Observation Chart PDF downloaded');
        } catch (err) {
            console.error('Error downloading ICU chart PDF:', err);
            toast.error('Failed to generate ICU chart PDF');
        } finally {
            setDownloading(false);
        }
    };

    // Handle Print
    const handlePrint = async () => {
        try {
            await printICUChart({
                admission,
                patient: initialPatient,
                hospital: tenantHospital,
                icuData: icuData || {},
                chartDate
            });
        } catch (err) {
            console.error('Error printing ICU chart:', err);
            toast.error('Failed to open print dialog');
        }
    };

    const handleApproveVoiceScribe = ({ sections, session }) => {
        const text = session?.rawTranscript || Object.values(sections || {}).filter(Boolean).join('. ');
        toast.success(`Voice note transcribed: "${(text || '').substring(0, 40)}..."`);
    };

    useEffect(() => {
        const bodyEl = document.querySelector('.icu-modal-body');
        if (bodyEl) bodyEl.scrollTop = 0;
    }, [activeTab]);

    if (!isOpen) return null;

    const pb = viewModel.patientBanner;
    const isAccredited = viewModel.branding?.accreditation?.enabled === true;

    // Helper to calculate CSS percentage positions based on 1600 x 1324 template
    const pctX = (px) => `${((px / 1600) * 100).toFixed(3)}%`;
    const pctY = (py) => `${((py / 1324) * 100).toFixed(3)}%`;

    return (
        <div className="icu-modal-overlay" onClick={onClose}>
            <div className="icu-modal-container" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="icu-modal-header">
                    <div className="icu-header-left">
                        <h3 className="icu-header-title">
                            <FiActivity style={{ color: '#0284c7' }} />
                            IPD ICU Daily Observation Chart
                        </h3>
                        <span className="icu-header-badge">2-PAGE OFFICIAL</span>
                    </div>

                    <div className="icu-modal-header-actions">
                        <div className="icu-date-picker-wrap" title="Observation Date">
                            <FiCalendar style={{ color: '#0284c7' }} />
                            <span>Date:</span>
                            <input
                                type="date"
                                value={chartDate}
                                onChange={(e) => setChartDate(e.target.value)}
                            />
                        </div>

                        <button
                            type="button"
                            className="icu-btn icu-btn-scribe"
                            onClick={() => setIsScribeModalOpen(true)}
                            title="AI Voice Scribe & Dictation"
                        >
                            <FiMic /> AI Voice Scribe
                        </button>

                        <button
                            type="button"
                            className="icu-btn icu-btn-print"
                            onClick={handlePrint}
                            disabled={loading || downloading}
                        >
                            <FiPrinter /> Print Chart
                        </button>

                        <button
                            type="button"
                            className="icu-btn icu-btn-download"
                            onClick={handleDownload}
                            disabled={loading || downloading}
                        >
                            <FiDownload /> {downloading ? 'Generating PDF...' : 'Download PDF'}
                        </button>

                        <button
                            type="button"
                            className="icu-btn-close"
                            onClick={onClose}
                            title="Close"
                        >
                            <FiX size={20} />
                        </button>
                    </div>
                </div>

                {/* Patient Summary Subbar */}
                <div className="icu-subbar">
                    <div className="icu-patient-summary">
                        <span>Patient: <strong>{pb.name || '—'}</strong></span>
                        <span>UHID: <strong>{pb.uhid || '—'}</strong></span>
                        <span>IPD: <strong>{pb.ipd || '—'}</strong></span>
                        <span>Gender/Age: <strong>{[pb.gender, pb.age].filter(Boolean).join(' / ') || '—'}</strong></span>
                        <span>Ward/Bed: <strong>{viewModel.demographics.wardBed || '—'}</strong></span>
                    </div>
                    <div className="icu-stream-stats">
                        <span className={`icu-stat-pill ${(icuData?.vitals || []).length > 0 ? 'active' : ''}`}>
                            Vitals: {(icuData?.vitals || []).length}
                        </span>
                        <span className={`icu-stat-pill ${(icuData?.intakeOutput || []).length > 0 ? 'active' : ''}`}>
                            I/O: {(icuData?.intakeOutput || []).length}
                        </span>
                        <span className={`icu-stat-pill ${(icuData?.orders || []).length > 0 ? 'active' : ''}`}>
                            Orders: {(icuData?.orders || []).length}
                        </span>
                    </div>
                </div>

                {/* Tabs */}
                <div className="icu-nav-tabs">
                    <button
                        type="button"
                        className={`icu-tab-btn ${activeTab === 'page1' ? 'active' : ''}`}
                        onClick={() => setActiveTab('page1')}
                    >
                        <FiFileText /> Page 1: Vitals, Intake/Output & Medications
                    </button>
                    <button
                        type="button"
                        className={`icu-tab-btn ${activeTab === 'page2' ? 'active' : ''}`}
                        onClick={() => setActiveTab('page2')}
                    >
                        <FiLayers /> Page 2: Ventilatory Settings & Nursing Notes
                    </button>
                    <button
                        type="button"
                        className={`icu-tab-btn ${activeTab === 'both' ? 'active' : ''}`}
                        onClick={() => setActiveTab('both')}
                    >
                        <FiPrinter /> Both Pages (Full Preview)
                    </button>
                </div>

                {/* Modal Body */}
                <div className="icu-modal-body">
                    {loading ? (
                        <div className="icu-loading-overlay">
                            <div className="icu-spinner" />
                            <span>Loading ICU observation chart records...</span>
                        </div>
                    ) : (
                        <>
                            {/* PAGE 1 PREVIEW */}
                            {(activeTab === 'page1' || activeTab === 'both') && (
                                <div className="icu-sheet-container">
                                    <div className="icu-sheet-header-label">
                                        <span>Page 1 — Hourly Vitals, Intake & Output, Medications</span>
                                        <span>Orientation: Landscape A4 (Exact Reference)</span>
                                    </div>
                                    <div className="icu-sheet-canvas-wrapper">
                                        <img
                                            src={ICU_CHART_TEMPLATE_PAGE1_URL}
                                            alt="ICU Chart Page 1"
                                            className="icu-sheet-bg-img"
                                        />

                                        <div className="icu-sheet-overlay">
                                            {/* Patient Top Blue Banner */}
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    left: '4.6%',
                                                    top: '3.6%',
                                                    fontFamily: 'Times New Roman, serif',
                                                    fontSize: '1.25cqw',
                                                    color: '#001eff',
                                                    whiteSpace: 'nowrap',
                                                    fontWeight: 500
                                                }}
                                            >
                                                Patient Name : {pb.name} &nbsp;&nbsp;&nbsp; UHID : {pb.uhid} &nbsp;&nbsp;&nbsp; IPD : {pb.ipd} &nbsp;&nbsp;&nbsp; Gender : {pb.gender} &nbsp;&nbsp;&nbsp; Age : {pb.age}
                                            </div>

                                            {/* Header NABH Seal */}
                                            {isAccredited && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        left: pctX(55),
                                                        top: pctY(140),
                                                        width: pctX(100),
                                                        height: pctY(80),
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center'
                                                    }}
                                                >
                                                    <img
                                                        src={COMMON_NABH_LOGO_URL}
                                                        alt="NABH"
                                                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                    />
                                                    {viewModel.branding.accreditation.certNo && (
                                                        <span
                                                            style={{
                                                                color: '#b91c1c',
                                                                fontWeight: 700,
                                                                fontSize: '0.55cqw',
                                                                marginTop: '2px',
                                                                textAlign: 'center'
                                                            }}
                                                        >
                                                            {viewModel.branding.accreditation.certNo}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Hospital Logo */}
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    left: isAccredited ? pctX(220) : pctX(120),
                                                    top: pctY(145),
                                                    width: isAccredited ? pctX(380) : pctX(480),
                                                    height: pctY(85),
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                {viewModel.branding.logoUrl ? (
                                                    <img
                                                        src={viewModel.branding.logoUrl}
                                                        alt={viewModel.branding.name}
                                                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                                    />
                                                ) : (
                                                    <span
                                                        style={{
                                                            fontFamily: 'Times New Roman, serif',
                                                            fontSize: '1.8cqw',
                                                            fontWeight: 'bold',
                                                            color: '#0f172a'
                                                        }}
                                                    >
                                                        {viewModel.branding.name}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Demographics Block */}
                                            {viewModel.demographics.date && (
                                                <span style={{ position: 'absolute', left: pctX(85), top: pctY(274), fontSize: '11px', fontWeight: 'bold', background: 'rgba(255, 255, 255, 0.95)', padding: '0 3px', borderRadius: '2px' }}>
                                                    {viewModel.demographics.date}
                                                </span>
                                            )}
                                            {viewModel.demographics.bedNo && (
                                                <span style={{ position: 'absolute', left: pctX(365), top: pctY(274), fontSize: '11px', fontWeight: 'bold', background: 'rgba(255, 255, 255, 0.95)', padding: '0 3px', borderRadius: '2px' }}>
                                                    {viewModel.demographics.bedNo}
                                                </span>
                                            )}
                                            {viewModel.demographics.patientName && (
                                                <span style={{ position: 'absolute', left: pctX(140), top: pctY(310), fontSize: '11px', fontWeight: 'bold', background: 'rgba(255, 255, 255, 0.95)', padding: '0 4px', borderRadius: '2px' }}>
                                                    {viewModel.demographics.patientName}
                                                </span>
                                            )}
                                            {viewModel.demographics.ipdNo && (
                                                <span style={{ position: 'absolute', left: pctX(85), top: pctY(360), fontSize: '11px', fontWeight: 'bold', background: 'rgba(255, 255, 255, 0.95)', padding: '0 4px', borderRadius: '2px' }}>
                                                    {viewModel.demographics.ipdNo}
                                                </span>
                                            )}
                                            {viewModel.demographics.wardBed && (
                                                <span style={{ position: 'absolute', left: pctX(140), top: pctY(412), fontSize: '11px', fontWeight: 'bold', background: 'rgba(255, 255, 255, 0.95)', padding: '0 4px', borderRadius: '2px' }}>
                                                    {viewModel.demographics.wardBed}
                                                </span>
                                            )}
                                            {viewModel.demographics.icuDays && (
                                                <span style={{ position: 'absolute', left: pctX(215), top: pctY(451), fontSize: '11px', background: 'rgba(255, 255, 255, 0.95)', padding: '0 3px' }}>
                                                    {viewModel.demographics.icuDays}
                                                </span>
                                            )}
                                            {viewModel.demographics.bloodGroup && (
                                                <span style={{ position: 'absolute', left: pctX(215), top: pctY(476), fontSize: '11px', background: 'rgba(255, 255, 255, 0.95)', padding: '0 3px' }}>
                                                    {viewModel.demographics.bloodGroup}
                                                </span>
                                            )}
                                            {viewModel.demographics.allergy && (
                                                <span style={{ position: 'absolute', left: pctX(215), top: pctY(501), fontSize: '11px', fontWeight: 'bold', color: '#b91c1c', background: 'rgba(255, 255, 255, 0.95)', padding: '0 3px' }}>
                                                    {viewModel.demographics.allergy}
                                                </span>
                                            )}
                                            {viewModel.demographics.diagnosis && (
                                                <span style={{ position: 'absolute', left: pctX(215), top: pctY(532), width: pctX(250), fontSize: '10.5px', lineHeight: 1.2, background: 'rgba(255, 255, 255, 0.95)', padding: '0 3px' }}>
                                                    {viewModel.demographics.diagnosis}
                                                </span>
                                            )}
                                            {viewModel.demographics.procedure && (
                                                <span style={{ position: 'absolute', left: pctX(215), top: pctY(590), width: pctX(250), fontSize: '10.5px', lineHeight: 1.2, background: 'rgba(255, 255, 255, 0.95)', padding: '0 3px' }}>
                                                    {viewModel.demographics.procedure}
                                                </span>
                                            )}

                                            {/* Nursing Staff on Duty */}
                                            {viewModel.nursingStaff.morning && (
                                                <span style={{ position: 'absolute', left: pctX(500), top: pctY(310), fontSize: '0.8cqw', maxWidth: pctX(140) }}>
                                                    {viewModel.nursingStaff.morning}
                                                </span>
                                            )}
                                            {viewModel.nursingStaff.evening && (
                                                <span style={{ position: 'absolute', left: pctX(500), top: pctY(360), fontSize: '0.8cqw', maxWidth: pctX(140) }}>
                                                    {viewModel.nursingStaff.evening}
                                                </span>
                                            )}
                                            {viewModel.nursingStaff.night && (
                                                <span style={{ position: 'absolute', left: pctX(500), top: pctY(410), fontSize: '0.8cqw', maxWidth: pctX(140) }}>
                                                    {viewModel.nursingStaff.night}
                                                </span>
                                            )}

                                            {/* Intake / Output Summary */}
                                            {viewModel.ioSummary.todayIntake && (
                                                <span style={{ position: 'absolute', left: pctX(940), top: pctY(276), fontSize: '0.75cqw' }}>
                                                    {viewModel.ioSummary.todayIntake}
                                                </span>
                                            )}
                                            {viewModel.ioSummary.balanceIntake && (
                                                <span style={{ position: 'absolute', left: pctX(940), top: pctY(298), fontSize: '0.75cqw' }}>
                                                    {viewModel.ioSummary.balanceIntake}
                                                </span>
                                            )}
                                            {viewModel.ioSummary.todayOutput && (
                                                <span style={{ position: 'absolute', left: pctX(940), top: pctY(338), fontSize: '0.75cqw' }}>
                                                    {viewModel.ioSummary.todayOutput}
                                                </span>
                                            )}
                                            {viewModel.ioSummary.drain && (
                                                <span style={{ position: 'absolute', left: pctX(940), top: pctY(380), fontSize: '0.75cqw' }}>
                                                    {viewModel.ioSummary.drain}
                                                </span>
                                            )}
                                            {viewModel.ioSummary.bowel && (
                                                <span style={{ position: 'absolute', left: pctX(940), top: pctY(400), fontSize: '0.75cqw' }}>
                                                    {viewModel.ioSummary.bowel}
                                                </span>
                                            )}

                                            {/* Investigations */}
                                            {(viewModel.investigations || []).map((inv, idx) => (
                                                <span
                                                    key={idx}
                                                    style={{
                                                        position: 'absolute',
                                                        left: pctX(1210),
                                                        top: pctY(310 + idx * 26),
                                                        fontSize: '0.72cqw',
                                                        maxWidth: pctX(330),
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis'
                                                    }}
                                                >
                                                    {inv}
                                                </span>
                                            ))}

                                            {/* Hourly Grid Rows */}
                                            {viewModel.hourlyRows.map((row, i) => (
                                                <React.Fragment key={i}>
                                                    {row.pulse && <span style={{ position: 'absolute', left: pctX(96.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.pulse}</span>}
                                                    {row.rr && <span style={{ position: 'absolute', left: pctX(133.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.rr}</span>}
                                                    {row.temp && <span style={{ position: 'absolute', left: pctX(170.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.temp}</span>}
                                                    {row.bp && <span style={{ position: 'absolute', left: pctX(207.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.bp}</span>}
                                                    {row.spo2 && <span style={{ position: 'absolute', left: pctX(244.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.spo2}</span>}
                                                    {row.o2 && <span style={{ position: 'absolute', left: pctX(281.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.o2}</span>}
                                                    {row.cvp && <span style={{ position: 'absolute', left: pctX(318.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.cvp}</span>}
                                                    {row.gcs && <span style={{ position: 'absolute', left: pctX(355.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.gcs}</span>}
                                                    {row.remark && <span style={{ position: 'absolute', left: pctX(376), width: pctX(57), top: pctY(row.yCenter - 10), textAlign: 'center', fontSize: '0.60cqw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.remark}>{row.remark}</span>}

                                                    {row.oral && <span style={{ position: 'absolute', left: pctX(453.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.oral}</span>}
                                                    {row.ng && <span style={{ position: 'absolute', left: pctX(490.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.ng}</span>}
                                                    {row.iv && <span style={{ position: 'absolute', left: pctX(527.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.iv}</span>}
                                                    {row.infusion && <span style={{ position: 'absolute', left: pctX(558.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.infusion}</span>}
                                                    {row.totIntake && <span style={{ position: 'absolute', left: pctX(583.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.totIntake}</span>}

                                                    {row.urine && <span style={{ position: 'absolute', left: pctX(608.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.urine}</span>}
                                                    {row.drain && <span style={{ position: 'absolute', left: pctX(633.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.drain}</span>}
                                                    {row.stool && <span style={{ position: 'absolute', left: pctX(664.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.stool}</span>}
                                                    {row.rta && <span style={{ position: 'absolute', left: pctX(701.0), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.rta}</span>}
                                                    {row.totOutput && <span style={{ position: 'absolute', left: pctX(737.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.totOutput}</span>}

                                                    {row.sno && <span style={{ position: 'absolute', left: pctX(901.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.sno}</span>}
                                                    {row.drugName && <span style={{ position: 'absolute', left: pctX(918), top: pctY(row.yCenter - 10), fontSize: '0.65cqw', maxWidth: pctX(280), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.drugName}</span>}
                                                    {row.dose && <span style={{ position: 'absolute', left: pctX(1228.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.dose}</span>}
                                                    {row.route && <span style={{ position: 'absolute', left: pctX(1265.5), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.route}</span>}
                                                    {row.freq && <span style={{ position: 'absolute', left: pctX(1303.0), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw' }}>{row.freq}</span>}
                                                    {row.time && <span style={{ position: 'absolute', left: pctX(1328), top: pctY(row.yCenter - 10), fontSize: '0.60cqw', maxWidth: pctX(138), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.time}</span>}
                                                    {row.sign && <span style={{ position: 'absolute', left: pctX(1515), top: pctY(row.yCenter - 10), transform: 'translateX(-50%)', fontSize: '0.65cqw', maxWidth: pctX(80), overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sign}</span>}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* PAGE 2 PREVIEW */}
                            {(activeTab === 'page2' || activeTab === 'both') && (
                                <div className="icu-sheet-container">
                                    <div className="icu-sheet-header-label">
                                        <span>Page 2 — Ventilatory Settings, Nursing Notes & Diet Chart</span>
                                        <span>Orientation: Landscape A4 (Exact Reference)</span>
                                    </div>
                                    <div className="icu-sheet-canvas-wrapper">
                                        <img
                                            src={ICU_CHART_TEMPLATE_PAGE2_URL}
                                            alt="ICU Chart Page 2"
                                            className="icu-sheet-bg-img"
                                        />

                                        <div className="icu-sheet-overlay">
                                            {/* Patient Top Blue Banner */}
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    left: '4.6%',
                                                    top: '3.6%',
                                                    fontFamily: 'Times New Roman, serif',
                                                    fontSize: '1.25cqw',
                                                    color: '#001eff',
                                                    whiteSpace: 'nowrap',
                                                    fontWeight: 500
                                                }}
                                            >
                                                Patient Name : {pb.name} &nbsp;&nbsp;&nbsp; UHID : {pb.uhid} &nbsp;&nbsp;&nbsp; IPD : {pb.ipd} &nbsp;&nbsp;&nbsp; Gender : {pb.gender} &nbsp;&nbsp;&nbsp; Age : {pb.age}
                                            </div>

                                            {/* Nursing Notes */}
                                            <div style={{ position: 'absolute', left: pctX(515), top: pctY(215), width: pctX(565), height: pctY(385), fontSize: '0.72cqw', overflow: 'hidden' }}>
                                                {viewModel.page2.notesMorning.map((m, i) => (
                                                    <div key={i} style={{ height: pctY(33.4), lineHeight: '2.5cqw', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m}</div>
                                                ))}
                                            </div>
                                            <div style={{ position: 'absolute', left: pctX(515), top: pctY(645), width: pctX(565), height: pctY(325), fontSize: '0.72cqw', overflow: 'hidden' }}>
                                                {viewModel.page2.notesEvening.map((e, i) => (
                                                    <div key={i} style={{ height: pctY(33.4), lineHeight: '2.5cqw', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e}</div>
                                                ))}
                                            </div>
                                            <div style={{ position: 'absolute', left: pctX(515), top: pctY(1015), width: pctX(565), height: pctY(285), fontSize: '0.72cqw', overflow: 'hidden' }}>
                                                {viewModel.page2.notesNight.map((n, i) => (
                                                    <div key={i} style={{ height: pctY(33.4), lineHeight: '2.5cqw', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</div>
                                                ))}
                                            </div>

                                            {/* Diabetic Chart */}
                                            {(viewModel.page2.diabeticRows || []).map((dr, idx) => (
                                                <React.Fragment key={idx}>
                                                    {dr.time && <span style={{ position: 'absolute', left: pctX(1146), top: pctY(230 + idx * 25), transform: 'translateX(-50%)', fontSize: '0.7cqw' }}>{dr.time}</span>}
                                                    {dr.sugar && <span style={{ position: 'absolute', left: pctX(1219), top: pctY(230 + idx * 25), transform: 'translateX(-50%)', fontSize: '0.7cqw' }}>{dr.sugar}</span>}
                                                    {dr.insulin && <span style={{ position: 'absolute', left: pctX(1303), top: pctY(230 + idx * 25), transform: 'translateX(-50%)', fontSize: '0.7cqw' }}>{dr.insulin}</span>}
                                                    {dr.sign && <span style={{ position: 'absolute', left: pctX(1470), top: pctY(230 + idx * 25), transform: 'translateX(-50%)', fontSize: '0.7cqw' }}>{dr.sign}</span>}
                                                </React.Fragment>
                                            ))}

                                            {/* Diet Chart */}
                                            <div style={{ position: 'absolute', left: pctX(1145), top: pctY(770), width: pctX(400), fontSize: '0.75cqw', lineHeight: 1.8 }}>
                                                {viewModel.page2.dietOrders.map((d, i) => (
                                                    <div key={i}>{i + 1}. {d}</div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* AI Voice Scribe Modal */}
                <ClinicalVoiceScribeModal
                    isOpen={isScribeModalOpen}
                    onClose={() => setIsScribeModalOpen(false)}
                    onApproveAndInsert={handleApproveVoiceScribe}
                    patientName={pb.name}
                    uhid={pb.uhid}
                    ipdNumber={pb.ipd}
                />
            </div>
        </div>
    );
};

export default ICUChartModal;
