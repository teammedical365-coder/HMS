import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/hooks';
import { doctorAPI, admissionAPI } from '../../utils/api';
import { 
    FiUsers, FiActivity, FiFileText, FiHeart, FiLock, 
    FiZap, FiPackage, FiClipboard, FiCheckCircle, FiCpu,
    FiChevronRight, FiLayers
} from 'react-icons/fi';
import { FaFlask, FaCapsules, FaStethoscope } from 'react-icons/fa';
import './DoctorDashboard.css';

const DoctorDashboard = () => {
    const navigate = useNavigate();
    const { user: authUser } = useAuth();
    const [localUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('user') || '{}');
        } catch {
            return {};
        }
    });

    const user = authUser || localUser || {};
    const [stats, setStats] = useState({ today: 0, pending: 0, completed: 0, total: 0 });
    const [activeAdmissions, setActiveAdmissions] = useState([]);
    const [loading, setLoading] = useState(false);

    // Time-based greeting (Morning, Afternoon, Evening)
    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return 'Good morning,';
        if (hour >= 12 && hour < 17) return 'Good afternoon,';
        return 'Good evening,';
    }, []);

    // Doctor display name
    const doctorDisplayName = useMemo(() => {
        const rawName = user.name || 'Doctor';
        return rawName.replace(/^Dr\.?\s*/i, '');
    }, [user.name]);

    useEffect(() => {
        let isMounted = true;
        const fetchDoctorStats = async () => {
            try {
                setLoading(true);
                const [aptRes, admRes] = await Promise.all([
                    doctorAPI.getAppointments().catch(() => null),
                    admissionAPI.getActiveAdmissions().catch(() => null)
                ]);

                if (isMounted) {
                    if (aptRes?.success) {
                        const apts = Array.isArray(aptRes.appointments) ? aptRes.appointments : [];
                        const todayStr = new Date().toISOString().split('T')[0];
                        const todayApts = apts.filter(a => a.appointmentDate && String(a.appointmentDate).startsWith(todayStr));
                        const pendingApts = apts.filter(a => ['pending', 'confirmed', 'scheduled', 'in_progress'].includes(a.status));
                        const completedApts = apts.filter(a => a.status === 'completed');

                        setStats({
                            today: todayApts.length,
                            pending: pendingApts.length,
                            completed: completedApts.length,
                            total: apts.length
                        });
                    }

                    if (admRes) {
                        const list = admRes.admissions || admRes.data || (Array.isArray(admRes) ? admRes : []);
                        setActiveAdmissions(list);
                    }
                }
            } catch (err) {
                console.warn("Could not load doctor stats or active admissions:", err?.message || err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchDoctorStats();
        return () => { isMounted = false; };
    }, []);

    // Non-clickable display-only permission items
    const permissionItems = [
        {
            id: 'ai_assistant',
            title: 'AI Assistant',
            icon: <FiCpu />,
            iconBg: '#ede9fe',
            iconColor: '#7c3aed'
        },
        {
            id: 'visit_diagnose',
            title: 'Visit Diagnose',
            icon: <FaStethoscope />,
            iconBg: '#eff6ff',
            iconColor: '#2563eb'
        },
        {
            id: 'patient_view',
            title: 'Patient View',
            icon: <FiUsers />,
            iconBg: '#ecfdf5',
            iconColor: '#059669'
        },
        {
            id: 'clinical_history',
            title: 'Clinical History View',
            icon: <FiFileText />,
            iconBg: '#f5f3ff',
            iconColor: '#7c3aed'
        },
        {
            id: 'lab_view',
            title: 'Lab View',
            icon: <FaFlask />,
            iconBg: '#fffbeb',
            iconColor: '#d97706'
        },
        {
            id: 'pharmacy_view',
            title: 'Pharmacy View',
            icon: <FaCapsules />,
            iconBg: '#fdf2f8',
            iconColor: '#db2777'
        },
        {
            id: 'ipd_charts_view',
            title: 'IPD Clinical Records & Charts',
            icon: <FiActivity />,
            iconBg: '#e0f2fe',
            iconColor: '#0284c7'
        }
    ];

    return (
        <div className="doc-main-dashboard-container">
            {/* 1. HERO BANNER SECTION (Full Width, Sleek Dark Navy Theme, Seamlessly Blended Doctor AI Graphic) */}
            <div className="doc-hero-banner">
                <div className="doc-hero-content">
                    <h1 className="doc-hero-heading">
                        {greeting}
                        <span className="doc-hero-name-highlight">
                            {doctorDisplayName}
                        </span>
                    </h1>

                    <p className="doc-hero-subtext">
                        Here's your workspace.<br />
                        Pick any section to get started.
                    </p>
                </div>

                {/* Seamlessly Integrated Doctor AI Graphic */}
                <div className="doc-hero-bg-art">
                    <img 
                        src="/assets/doctor_ai_neural_banner.png" 
                        alt="Doctor AI Clinical Assistant" 
                        className="doc-hero-doctor-bg-img"
                    />
                    <div className="doc-hero-art-glow" />
                </div>
            </div>

            {/* 2. MAIN BODY CONTENT (Zero outer margin/padding on page, clean structured inner spacing) */}
            <div className="doc-main-body-content">
                {/* QUICK ACCESS SECTION */}
                <div className="doc-section-block">
                    <div className="doc-section-header">
                        <FiZap className="doc-section-icon" />
                        <h2>QUICK ACCESS</h2>
                    </div>

                    <div className="doc-quick-access-grid">
                        <div 
                            className="doc-quick-access-card" 
                            onClick={() => navigate('/doctor/patients')}
                            title="Click to access Patient Queue and Workspace"
                        >
                            <div className="doc-quick-left">
                                <div className="doc-quick-icon-wrapper">
                                    <FiUsers className="doc-quick-icon" />
                                </div>
                                <div className="doc-quick-info">
                                    <h3 className="doc-quick-title">Patients</h3>
                                    <p className="doc-quick-desc">Access your patient queue and clinical workspace</p>
                                </div>
                            </div>

                            <div className="doc-quick-art-wrapper">
                                <img 
                                    src="/assets/stethoscope_card_bg.jpg" 
                                    alt="Stethoscope clinical art" 
                                    className="doc-quick-stethoscope-img"
                                />
                            </div>
                        </div>

                        <div 
                            className="doc-quick-access-card doc-quick-ipd-card" 
                            onClick={() => navigate('/doctor/ipd-patients')}
                            title="Click to access Admitted IPD Patients & Clinical Charts"
                        >
                            <div className="doc-quick-left">
                                <div className="doc-quick-icon-wrapper doc-ipd-icon-wrap">
                                    <FiActivity className="doc-quick-icon" />
                                </div>
                                <div className="doc-quick-info">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h3 className="doc-quick-title">IPD Clinical Records</h3>
                                        <span className="doc-quick-ipd-badge">
                                            🏥 {activeAdmissions.length} ADMITTED
                                        </span>
                                    </div>
                                    <p className="doc-quick-desc">ICU charts, TPR vitals, progress notes, MAR & drug charts</p>
                                </div>
                            </div>

                            <div className="doc-quick-art-wrapper doc-quick-ipd-art">
                                <div className="doc-quick-ipd-pulse"></div>
                            </div>
                        </div>

                        <div 
                            className="doc-quick-access-card doc-quick-ai-card" 
                            onClick={() => navigate('/doctor/ai-assistant')}
                            title="Click to launch AI Clinical Assistant"
                        >
                            <div className="doc-quick-left">
                                <div className="doc-quick-icon-wrapper doc-ai-icon-wrap">
                                    <FiCpu className="doc-quick-icon" />
                                </div>
                                <div className="doc-quick-info">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h3 className="doc-quick-title">AI Assistant</h3>
                                        <span className="doc-quick-ai-badge">⚡ AI POWERED</span>
                                    </div>
                                    <p className="doc-quick-desc">Clinical intelligence, report analysis & diagnostic assistant</p>
                                </div>
                            </div>

                            <div className="doc-quick-art-wrapper doc-quick-ai-art">
                                <div className="doc-quick-ai-orb"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ACTIVE IPD PATIENTS (HOSPITALIZED) */}
                <div className="doc-section-block">
                    <div className="doc-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FiActivity className="doc-section-icon" />
                            <h2>ACTIVE IPD PATIENTS ({activeAdmissions.length})</h2>
                        </div>
                        <button 
                            type="button" 
                            className="doc-ipd-view-all-btn"
                            onClick={() => navigate('/doctor/ipd-patients')}
                        >
                            <span>View All IPD Records</span>
                            <FiChevronRight size={14} />
                        </button>
                    </div>

                    {activeAdmissions.length === 0 ? (
                        <div className="doc-empty-ipd-card">
                            <FiCheckCircle size={24} color="#059669" />
                            <span>No patients currently admitted under your hospital/ward.</span>
                            <button 
                                type="button" 
                                className="doc-ipd-open-dir-btn"
                                onClick={() => navigate('/doctor/ipd-patients')}
                            >
                                Open IPD Directory
                            </button>
                        </div>
                    ) : (
                        <div className="doc-ipd-mini-grid">
                            {activeAdmissions.slice(0, 4).map((adm) => {
                                const pt = adm.patientId || {};
                                const name = pt.name || adm.patientName || 'Patient';
                                const uhid = pt.uhid || adm.uhid || '—';
                                const ipdNo = adm.admissionNumber || adm.ipdNumber || '—';
                                const ward = adm.ward || adm.bed?.ward || 'General';
                                const bed = adm.bedNumber || adm.bed?.bedNumber || '—';
                                const isICU = /icu|ccu|nicu|picu/i.test(`${ward} ${bed}`);

                                return (
                                    <div 
                                        key={adm._id} 
                                        className={`doc-ipd-card ${isICU ? 'icu-accent' : ''}`}
                                        onClick={() => navigate(`/doctor/ipd/patient/${adm._id}`)}
                                    >
                                        <div className="doc-ipd-card-head">
                                            <div className="doc-ipd-head-left">
                                                <h4 className="doc-ipd-name">{name}</h4>
                                                <div className="doc-ipd-meta-row">
                                                    <span>UHID: <strong>{uhid}</strong></span>
                                                    <span>•</span>
                                                    <span>IPD: <strong>{ipdNo}</strong></span>
                                                </div>
                                            </div>
                                            {isICU ? (
                                                <span className="doc-ipd-pill-badge icu-badge">ICU</span>
                                            ) : (
                                                <span className="doc-ipd-pill-badge">Admitted</span>
                                            )}
                                        </div>

                                        <div className="doc-ipd-loc-row">
                                            <span className="doc-ipd-ward-box">{ward} • Bed {bed}</span>
                                            <span className="doc-ipd-diag-text" title={adm.diagnosis || 'Active Inpatient'}>
                                                {adm.diagnosis || 'Active Inpatient'}
                                            </span>
                                        </div>

                                        <div className="doc-ipd-card-btns">
                                            <button 
                                                type="button" 
                                                className="doc-ipd-btn-sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/doctor/ipd/patient/${adm._id}?tab=tpr_vitals`);
                                                }}
                                            >
                                                TPR Vitals
                                            </button>
                                            <button 
                                                type="button" 
                                                className="doc-ipd-btn-sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/doctor/ipd/patient/${adm._id}?tab=progress_notes`);
                                                }}
                                            >
                                                Progress
                                            </button>
                                            <button 
                                                type="button" 
                                                className="doc-ipd-btn-sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/doctor/ipd/patient/${adm._id}?tab=drug_chart`);
                                                }}
                                            >
                                                Drug Chart
                                            </button>
                                            {isICU && (
                                                <button 
                                                    type="button" 
                                                    className="doc-ipd-btn-sm icu-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/doctor/ipd/patient/${adm._id}?tab=icu_chart`);
                                                    }}
                                                >
                                                    ICU Chart
                                                </button>
                                            )}
                                            <button 
                                                type="button" 
                                                className="doc-ipd-btn-open"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/doctor/ipd/patient/${adm._id}`);
                                                }}
                                            >
                                                Clinical Workspace &rarr;
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 3. YOUR PERMISSIONS SECTION (Display-Only / Non-Clickable Badges) */}
                <div className="doc-section-block">
                    <div className="doc-section-header">
                        <FiLock className="doc-section-icon" />
                        <h2>YOUR PERMISSIONS</h2>
                    </div>

                    <div className="doc-permissions-container">
                        {permissionItems.map((item) => (
                            <div 
                                key={item.id} 
                                className="doc-permission-pill"
                            >
                                <div 
                                    className="doc-permission-icon-circle"
                                    style={{ background: item.iconBg, color: item.iconColor }}
                                >
                                    {item.icon}
                                </div>
                                <span className="doc-permission-label">{item.title}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DoctorDashboard;