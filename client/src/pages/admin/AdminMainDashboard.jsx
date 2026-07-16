import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI, hospitalAPI } from '../../utils/api';
import { getSubscriptionLimits } from '../../utils/subscriptionPlans';
import './AdminMainDashboard.css';

const AdminMainDashboard = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const [stats, setStats] = useState({
        totalUsers: 0,
        totalRoles: 0,
        totalDoctors: 0,
        totalPatients: 0,
    });
    const [loading, setLoading] = useState(true);
    const [hospital, setHospital] = useState(null);
    const [staffCount, setStaffCount] = useState(0);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const [usersRes, rolesRes, hospitalRes] = await Promise.all([
                adminAPI.getUsers().catch(() => ({ success: false, users: [] })),
                adminAPI.getRoles().catch(() => ({ success: false, data: [] })),
                hospitalAPI.getMyHospital().catch(() => ({ success: false, hospital: null }))
            ]);
            const users = usersRes.success ? usersRes.users : [];
            const roles = rolesRes.success ? rolesRes.data : [];
            setStats({
                totalUsers: users.length,
                totalRoles: roles.length,
                totalDoctors: users.filter(u => (u.role || '').toLowerCase().includes('doctor')).length,
                totalPatients: users.filter(u => (u.role || '').toLowerCase() === 'patient').length,
            });
            
            setStaffCount(users.filter(u => {
                const rName = (u.role?.name || u.role || '').toLowerCase();
                return !rName.includes('doctor') && !['patient', 'hospitaladmin', 'centraladmin', 'superadmin'].includes(rName);
            }).length);

            if (hospitalRes.success && hospitalRes.hospital) {
                setHospital(hospitalRes.hospital);
            }
        } catch (err) {
            console.error('Error fetching stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const hour = new Date().getHours();
    let greeting = 'Good morning';
    let greetingEmoji = '☀️';
    if (hour >= 12 && hour < 17) { greeting = 'Good afternoon'; greetingEmoji = '🌤️'; }
    else if (hour >= 17) { greeting = 'Good evening'; greetingEmoji = '🌙'; }

    const dateString = new Date().toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });


    const statCards = [
        { icon: '👥', label: 'Total Users',   value: stats.totalUsers,   accent: '#14b8a6', bg: 'rgba(20,184,166,0.1)',   trend: '+12%' },
        { icon: '🔑', label: 'Active Roles',  value: stats.totalRoles,   accent: '#6366f1', bg: 'rgba(99,102,241,0.1)',   trend: null },
        { icon: '👨‍⚕️', label: 'Doctors',      value: stats.totalDoctors, accent: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   trend: null },
        { icon: '🩺', label: 'Patients',      value: stats.totalPatients,accent: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   trend: '+8%' },
    ];

    const quickActions = [
        { icon: '👥', label: 'Manage Users',         desc: 'View all staff & patients, edit roles, create accounts', path: '/admin/users',            bg: 'rgba(20,184,166,0.12)' },
        { icon: '🔑', label: 'Roles & Permissions',  desc: 'Create custom roles and assign granular permissions',    path: '/admin/roles',            bg: 'rgba(99,102,241,0.12)' },
        { icon: '👨‍⚕️', label: 'Doctors',             desc: 'Manage doctor profiles, specializations & schedules',  path: '/admin/doctors',          bg: 'rgba(59,130,246,0.12)' },
        { icon: '🧪', label: 'Labs',                 desc: 'Configure lab departments and lab workflows',            path: '/admin/labs',             bg: 'rgba(245,158,11,0.12)' },
        { icon: '📋', label: 'Lab Tests Catalog',    desc: 'Manage predefined lab tests for prescription',           path: '/admin/lab-tests',        bg: 'rgba(236,72,153,0.12)' },
        { icon: '📦', label: 'Tests & Packages',     desc: 'Create test packages and manage individual tests',       path: '/admin/test-packages',    bg: 'rgba(124,58,237,0.12)' },
        { icon: '💊', label: 'Pharmacy',             desc: 'Manage pharmacy inventory and suppliers',                path: '/admin/pharmacy',         bg: 'rgba(239,68,68,0.12)'  },
        { icon: '💉', label: 'Medicine Catalog',     desc: 'Manage global catalog of available medicines',           path: '/admin/medicines',        bg: 'rgba(239,68,68,0.1)'   },
        { icon: '🏥', label: 'Reception',            desc: 'Set up reception desk and appointment workflows',        path: '/admin/reception',        bg: 'rgba(16,185,129,0.12)' },
        { icon: '🛠️', label: 'Services',             desc: 'Hospital services, pricing, and categories',             path: '/admin/services',         bg: 'rgba(245,158,11,0.12)' },
        { icon: '👤', label: 'Create Staff Account', desc: 'Add a new staff member with login credentials',          path: '/admin/users',            bg: 'rgba(94,234,212,0.15)' },
        { icon: '❓', label: 'Question Library',     desc: 'Configure forms and assessment libraries for doctors',   path: '/admin/question-library', bg: 'rgba(167,139,250,0.15)' },
    ];

    return (
        <div className="admin-main-dashboard">
            <div className="dash-container">

                {/* Header (Greeting only, actions moved to TopBar) */}
                <div className="dash-header" style={{ marginBottom: '20px', borderBottom: 'none', paddingBottom: 0 }}>
                    <div className="dash-header-left">
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                            {greetingEmoji} {greeting},{' '}
                            <span style={{ color: 'var(--brand-600)' }}>{user.name || 'Admin'}</span>
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{dateString} · Here's a snapshot of your hospital.</p>
                    </div>
                </div>

                {/* Subscription Usage Overview */}
                {hospital && (hospital.subscriptionPlan === 'clinic_basic' || hospital.subscriptionPlan === 'multi_speciality_starter') && (() => {
                    const limits = getSubscriptionLimits(hospital.subscriptionPlan);
                    const remainingDoctors = Math.max(0, limits.maxDoctors - stats.totalDoctors);
                    const remainingStaff = Math.max(0, limits.maxStaff - staffCount);
                    
                    return (
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
                            <div style={{ flex: '1 1 200px' }}>
                                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Current Subscription</div>
                                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{limits.name}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '20px', flex: '2 1 400px' }}>
                                <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px 16px', flex: 1 }}>
                                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Doctors</div>
                                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#334155', marginTop: '2px' }}>{stats.totalDoctors} / {limits.maxDoctors}</div>
                                    <div style={{ fontSize: '11px', color: remainingDoctors === 0 ? '#dc2626' : '#10b981', marginTop: '4px', fontWeight: 600 }}>{remainingDoctors} Remaining</div>
                                </div>
                                <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px 16px', flex: 1 }}>
                                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Staff</div>
                                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#334155', marginTop: '2px' }}>{staffCount} / {limits.maxStaff}</div>
                                    <div style={{ fontSize: '11px', color: remainingStaff === 0 ? '#dc2626' : '#10b981', marginTop: '4px', fontWeight: 600 }}>{remainingStaff} Remaining</div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Stats */}
                <div className="stats-grid">
                    {statCards.map((stat, idx) => (
                        <div key={idx} className="stat-card">
                            <div className="stat-card-top">
                                <div className="stat-icon" style={{ background: stat.bg }}>
                                    {stat.icon}
                                </div>
                                {stat.trend && (
                                    <span className="stat-trend">↑ {stat.trend}</span>
                                )}
                            </div>
                            <p className="stat-value">
                                {loading
                                    ? <span className="loading-pulse" />
                                    : stat.value
                                }
                            </p>
                            <p className="stat-label">{stat.label}</p>
                            <div className="stat-accent" style={{ background: stat.accent }} />
                        </div>
                    ))}
                </div>

                {/* Quick Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '24px 0 16px' }}>
                    <div className="section-label" style={{ margin: 0 }}>⚡ Quick Actions</div>
                    <button 
                        onClick={() => navigate('/admin/users', { state: { openCreateForm: true } })} 
                        className="btn-save" 
                        style={{ padding: '8px 20px', fontSize: '14px', border: 'none', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: 'white', fontWeight: '700', cursor: 'pointer' }}
                    >
                        + Add Staff
                    </button>
                </div>
                <div className="actions-grid">
                    {quickActions.map((action, idx) => (
                        <div key={idx} className="action-card" onClick={() => navigate(action.path)}>
                            <div className="action-icon" style={{ background: action.bg }}>
                                {action.icon}
                            </div>
                            <div className="action-content">
                                <h3>{action.label}</h3>
                                <p>{action.desc}</p>
                            </div>
                            <span className="action-card-arrow">→</span>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
};

export default AdminMainDashboard;
