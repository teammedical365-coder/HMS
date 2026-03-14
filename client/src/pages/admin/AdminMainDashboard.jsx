import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../utils/api';
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

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            setLoading(true);
            // Fetch users and roles in parallel
            const [usersRes, rolesRes] = await Promise.all([
                adminAPI.getUsers().catch(() => ({ success: false, users: [] })),
                adminAPI.getRoles().catch(() => ({ success: false, data: [] }))
            ]);

            const users = usersRes.success ? usersRes.users : [];
            const roles = rolesRes.success ? rolesRes.data : [];

            setStats({
                totalUsers: users.length,
                totalRoles: roles.length,
                totalDoctors: users.filter(u => (u.role || '').toLowerCase().includes('doctor')).length,
                totalPatients: users.filter(u => (u.role || '').toLowerCase() === 'patient').length,
            });
        } catch (err) {
            console.error('Error fetching stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const hour = new Date().getHours();
    let greeting = 'Good morning';
    if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    else if (hour >= 17) greeting = 'Good evening';

    const quickActions = [
        {
            icon: '👥', label: 'Manage Users',
            desc: 'View all staff & patients, edit roles, create accounts',
            path: '/admin/users', bg: 'rgba(108,99,255,0.12)'
        },
        {
            icon: '🔑', label: 'Roles & Permissions',
            desc: 'Create custom roles and assign permissions',
            path: '/admin/roles', bg: 'rgba(72,199,142,0.12)'
        },
        {
            icon: '👨‍⚕️', label: 'Doctors',
            desc: 'Manage doctor profiles, specializations & schedules',
            path: '/admin/doctors', bg: 'rgba(52,152,219,0.12)'
        },
        {
            icon: '🧪', label: 'Labs',
            desc: 'Configure lab departments',
            path: '/admin/labs', bg: 'rgba(241,196,15,0.12)'
        },
        {
            icon: '📋', label: 'Lab Tests Catalog',
            desc: 'Manage predefined lab tests available for prescription',
            path: '/admin/lab-tests', bg: 'rgba(232,62,140,0.12)'
        },
        {
            icon: '📦', label: 'Tests & Packages',
            desc: 'Create test packages and manage individual tests',
            path: '/admin/test-packages', bg: 'rgba(124,58,237,0.12)'
        },
        {
            icon: '💊', label: 'Pharmacy',
            desc: 'Manage pharmacy inventory and suppliers',
            path: '/admin/pharmacy', bg: 'rgba(231,76,60,0.12)'
        },
        {
            icon: '💊', label: 'Medicine Catalog',
            desc: 'Manage global catalog of medicines',
            path: '/admin/medicines', bg: 'rgba(231,76,60,0.12)'
        },
        {
            icon: '🏥', label: 'Reception',
            desc: 'Set up reception desk and appointment workflows',
            path: '/admin/reception', bg: 'rgba(155,89,182,0.12)'
        },
        {
            icon: '🛠️', label: 'Services',
            desc: 'Hospital services, pricing, and categories',
            path: '/admin/services', bg: 'rgba(230,126,34,0.12)'
        },
        {
            icon: '👤', label: 'Create Staff Account',
            desc: 'Add a new staff member with login credentials',
            path: '/admin/users', bg: 'rgba(46,204,113,0.12)'
        },
        {
            icon: '❓', label: 'Question Library',
            desc: 'Configure forms and assessment libraries for doctors',
            path: '/admin/question-library', bg: 'rgba(142,68,173,0.12)'
        },
    ];

    const handleLogout = () => {
        const role = user?.role?.toLowerCase();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (role === 'centraladmin' || role === 'superadmin') {
            navigate('/supremeadmin/login');
        } else if (role === 'hospitaladmin') {
            navigate('/hospitaladmin/login');
        } else {
            navigate('/login');
        }
    };

    return (
        <div className="admin-main-dashboard">
            <div className="dash-container">
                {/* Header */}
                <div className="dash-header">
                    <div>
                        <h1>{greeting}, <span>{user.name || 'Admin'}</span></h1>
                        <p>Here's what's happening in your hospital today.</p>
                    </div>
                    <div className="dash-header-actions">
                        <button className="btn-primary" onClick={() => navigate('/admin/roles')}>🔑 Manage Roles</button>
                        <button className="btn-outline" onClick={handleLogout}>Logout</button>
                    </div>
                </div>

                {/* Stats */}
                <div className="stats-grid">
                    <div className="stat-card">
                        <span className="stat-icon">👥</span>
                        <p className="stat-value">{loading ? <span className="loading-pulse">...</span> : stats.totalUsers}</p>
                        <p className="stat-label">Total Users</p>
                        <div className="stat-accent" style={{ background: '#6c63ff' }} />
                    </div>
                    <div className="stat-card">
                        <span className="stat-icon">🔑</span>
                        <p className="stat-value">{loading ? <span className="loading-pulse">...</span> : stats.totalRoles}</p>
                        <p className="stat-label">Active Roles</p>
                        <div className="stat-accent" style={{ background: '#48c78e' }} />
                    </div>
                    <div className="stat-card">
                        <span className="stat-icon">👨‍⚕️</span>
                        <p className="stat-value">{loading ? <span className="loading-pulse">...</span> : stats.totalDoctors}</p>
                        <p className="stat-label">Doctors</p>
                        <div className="stat-accent" style={{ background: '#3498db' }} />
                    </div>
                    <div className="stat-card">
                        <span className="stat-icon">🩺</span>
                        <p className="stat-value">{loading ? <span className="loading-pulse">...</span> : stats.totalPatients}</p>
                        <p className="stat-label">Patients</p>
                        <div className="stat-accent" style={{ background: '#e74c3c' }} />
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="section-title">⚡ Quick Actions</div>
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
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AdminMainDashboard;
