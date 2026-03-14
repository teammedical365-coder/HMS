import React from 'react';
import { useNavigate } from 'react-router-dom';
import './RoleDashboard.css';

// Icon mapping — maps common path keywords to emojis
const getIconForPath = (path, label) => {
    const text = `${path} ${label}`.toLowerCase();
    if (text.includes('patient')) return '🩺';
    if (text.includes('doctor')) return '👨‍⚕️';
    if (text.includes('appointment')) return '📅';
    if (text.includes('lab') || text.includes('test')) return '🧪';
    if (text.includes('pharmacy') || text.includes('medicine') || text.includes('inventory')) return '💊';
    if (text.includes('order')) return '📦';
    if (text.includes('reception') || text.includes('front')) return '🏥';
    if (text.includes('report')) return '📊';
    if (text.includes('dashboard') || text.includes('home')) return '🏠';
    if (text.includes('admin') || text.includes('manage')) return '⚙️';
    if (text.includes('role') || text.includes('permission')) return '🔑';
    if (text.includes('service')) return '🛠️';
    if (text.includes('billing') || text.includes('payment')) return '💳';
    if (text.includes('user') || text.includes('staff')) return '👥';
    if (text.includes('setting')) return '⚙️';
    return '📋';
};

// Generate a description based on the label
const getDescForLink = (label) => {
    const text = label.toLowerCase();
    if (text.includes('patient')) return 'View and manage patient records';
    if (text.includes('doctor')) return 'Manage doctor profiles and schedules';
    if (text.includes('appointment')) return 'Schedule and manage appointments';
    if (text.includes('lab') && text.includes('test')) return 'View and process lab test requests';
    if (text.includes('lab')) return 'Access the laboratory dashboard';
    if (text.includes('inventory')) return 'Manage medicine stock and inventory';
    if (text.includes('order')) return 'Process and track pharmacy orders';
    if (text.includes('reception')) return 'Manage front desk operations';
    if (text.includes('report')) return 'View and download reports';
    if (text.includes('dashboard')) return 'View your overview and stats';
    if (text.includes('role')) return 'Manage roles and permissions';
    if (text.includes('service')) return 'Configure hospital services';
    if (text.includes('staff') || text.includes('user')) return 'Manage staff accounts';
    return `Access ${label}`;
};

const RoleDashboard = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const userName = user.name || 'Staff';
    const roleName = user.role || 'Staff';
    const navLinks = user.navLinks || [];
    const permissions = user.permissions || [];

    // Get time-based greeting
    const hour = new Date().getHours();
    let greeting = 'Good morning';
    if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    else if (hour >= 17) greeting = 'Good evening';

    return (
        <div className="role-dashboard">
            <div className="dashboard-container">
                {/* Welcome Hero */}
                <div className="welcome-hero">
                    <span className="welcome-emoji">👋</span>
                    <div className="role-badge-large">{roleName}</div>
                    <h1>{greeting}, <span>{userName}</span></h1>
                    <p>Here's your workspace. Pick any section to get started.</p>
                </div>

                {/* Quick Access Cards */}
                {navLinks.length > 0 ? (
                    <>
                        <div className="section-title">⚡ Quick Access</div>
                        <div className="nav-cards-grid">
                            {navLinks.map((link, index) => (
                                <div
                                    key={index}
                                    className="nav-card"
                                    onClick={() => navigate(link.path)}
                                >
                                    <div className="nav-card-icon">
                                        {getIconForPath(link.path, link.label)}
                                    </div>
                                    <div className="nav-card-content">
                                        <h3>{link.label}</h3>
                                        <p>{getDescForLink(link.label)}</p>
                                    </div>
                                    <span className="nav-card-arrow">→</span>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="empty-state">
                        <span className="empty-icon">📭</span>
                        <h3>No pages assigned yet</h3>
                        <p>Contact your superadmin to set up navigation links for your role.</p>
                    </div>
                )}

                {/* Permissions Preview */}
                {permissions.length > 0 && (
                    <div className="permissions-section">
                        <h3>🔐 Your Permissions</h3>
                        <div className="perm-tags">
                            {permissions.map((perm, i) => (
                                <span key={i} className="perm-tag">
                                    {perm.replace(/_/g, ' ')}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RoleDashboard;
