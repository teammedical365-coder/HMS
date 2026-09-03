import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/hooks';
import { doctorAPI } from '../../utils/api';
import { 
    FiUsers, FiActivity, FiFileText, FiHeart, FiLock, 
    FiZap, FiPackage, FiClipboard, FiCheckCircle
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
        const fetchDoctorStats = async () => {
            try {
                setLoading(true);
                const aptRes = await doctorAPI.getAppointments();
                if (aptRes?.success) {
                    const apts = aptRes.appointments || [];
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
            } catch (err) {
                console.error("Error fetching doctor stats:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchDoctorStats();
    }, []);

    const permissionItems = [
        {
            id: 'visit_diagnose',
            title: 'Visit Diagnose',
            icon: <FaStethoscope />,
            iconBg: '#eff6ff',
            iconColor: '#2563eb',
            path: '/doctor/patients'
        },
        {
            id: 'patient_view',
            title: 'Patient View',
            icon: <FiUsers />,
            iconBg: '#ecfdf5',
            iconColor: '#059669',
            path: '/doctor/patients'
        },
        {
            id: 'clinical_history',
            title: 'Clinical History View',
            icon: <FiFileText />,
            iconBg: '#f5f3ff',
            iconColor: '#7c3aed',
            path: '/doctor/patients'
        },
        {
            id: 'lab_view',
            title: 'Lab View',
            icon: <FaFlask />,
            iconBg: '#fffbeb',
            iconColor: '#d97706',
            path: '/lab-reports'
        },
        {
            id: 'pharmacy_view',
            title: 'Pharmacy View',
            icon: <FaCapsules />,
            iconBg: '#fdf2f8',
            iconColor: '#db2777',
            path: '/pharmacy'
        }
    ];

    return (
        <div className="doc-main-dashboard-container">
            {/* 1. HERO BANNER SECTION */}
            <div className="doc-hero-banner">
                {/* Left Text Column */}
                <div className="doc-hero-content">
                    <div className="doc-hero-badge">
                        <span className="doc-hero-wave">👋</span>
                        <span>WELCOME BACK, DOCTOR</span>
                    </div>

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
            </div>

            {/* 2. QUICK ACCESS SECTION */}
            <div className="doc-section-block">
                <div className="doc-section-header">
                    <FiZap className="doc-section-icon" />
                    <h2>QUICK ACCESS</h2>
                </div>

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
            </div>

            {/* 3. YOUR PERMISSIONS SECTION */}
            <div className="doc-section-block">
                <div className="doc-section-header">
                    <FiLock className="doc-section-icon" />
                    <h2>YOUR PERMISSIONS</h2>
                </div>

                <div className="doc-permissions-container">
                    {permissionItems.map((item) => (
                        <div 
                            key={item.id} 
                            className="doc-permission-pill-btn"
                            onClick={() => navigate(item.path)}
                            title={`Navigate to ${item.title}`}
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
    );
};

export default DoctorDashboard;