import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { FiHome, FiCalendar, FiClock, FiBox, FiUserCheck, FiActivity, FiHeart, FiCheckCircle, FiUser, FiFileText, FiRefreshCw, FiSearch, FiX } from 'react-icons/fi';

const OTHeader = ({ 
    title = 'Operation Theatre Dashboard',
    subtitle = 'Real-time OT operations, surgery scheduling and patient workflow management.',
    lastUpdated = null,
    loading = false,
    onRefresh = null,
    searchQuery = '',
    onSearchChange = null,
    badgeCounts = {}
}) => {
    const navigate = useNavigate();
    const location = useLocation();

    const navItems = [
        { label: 'Dashboard', path: '/ot/dashboard', altPath: '/ot-dashboard', icon: <FiHome />, badge: null },
        { label: 'Planned Surgeries', path: '/ot/planned', icon: <FiClock />, badge: badgeCounts.planned || null },
        { label: 'OT Schedule', path: '/ot/schedule', icon: <FiCalendar />, badge: badgeCounts.today || null },
        { label: 'OT Rooms', path: '/ot/rooms', icon: <FiBox />, badge: badgeCounts.roomsInUse ? `${badgeCounts.roomsInUse} in OT` : null },
        { label: 'Pre-Op', path: '/ot/pre-op', icon: <FiUserCheck />, badge: badgeCounts.preOp || null },
        { label: 'In OT', path: '/ot/in-progress', altPath: '/ot/in-ot', icon: <FiActivity />, badge: badgeCounts.inOt || null, isPulse: badgeCounts.inOt > 0 },
        { label: 'Post-Op', path: '/ot/post-op', icon: <FiHeart />, badge: badgeCounts.postOp || null },
        { label: 'Completed', path: '/ot/completed', icon: <FiCheckCircle />, badge: badgeCounts.completed || null },
        { label: 'Surgeons', path: '/ot/surgeons', icon: <FiUser />, badge: null },
        { label: 'Reports', path: '/ot/reports', icon: <FiFileText />, badge: null },
    ];

    return (
        <div style={{ marginBottom: '24px' }}>
            {/* Top Bar Header */}
            <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                color: '#fff',
                padding: '24px 28px',
                borderRadius: '16px',
                boxShadow: '0 10px 25px -5px rgba(15,23,42,0.3)',
                marginBottom: '16px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '1.75rem' }}>🏥</span>
                            <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                                {title}
                            </h1>
                        </div>
                        <p style={{ margin: '6px 0 0 42px', color: '#94a3b8', fontSize: '0.9rem' }}>
                            {subtitle}
                        </p>
                    </div>

                    {/* Right Tools (Last Updated + Refresh Button) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {lastUpdated && (
                            <div style={{
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                padding: '6px 14px',
                                borderRadius: '20px',
                                fontSize: '0.82rem',
                                color: '#cbd5e1',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
                                <span>Last updated: <strong>{lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span>
                            </div>
                        )}
                        {onRefresh && (
                            <button
                                onClick={onRefresh}
                                disabled={loading}
                                style={{
                                    background: 'rgba(255,255,255,0.12)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    color: '#fff',
                                    padding: '8px 16px',
                                    borderRadius: '10px',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <FiRefreshCw className={loading ? 'animate-spin' : ''} />
                                <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Global OT Search Bar */}
                {onSearchChange && (
                    <div style={{ marginTop: '18px', position: 'relative', maxWidth: '640px' }}>
                        <FiSearch style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '1.1rem' }} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder="Global OT Search: patient name, MRN, procedure, surgeon, OT room, plan ID..."
                            style={{
                                width: '100%',
                                padding: '11px 40px 11px 42px',
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '10px',
                                color: '#fff',
                                fontSize: '0.9rem',
                                outline: 'none',
                                boxSizing: 'border-box'
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => onSearchChange('')}
                                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}
                            >
                                <FiX />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Quick OT Module Navigation Tabs */}
            <div style={{
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '8px',
                scrollbarWidth: 'thin'
            }}>
                {navItems.map((item, idx) => {
                    const isActive = location.pathname === item.path || (item.altPath && location.pathname === item.altPath);
                    return (
                        <NavLink
                            key={idx}
                            to={item.path}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '9px 16px',
                                borderRadius: '10px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                textDecoration: 'none',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.2s ease',
                                background: isActive ? '#3b82f6' : '#ffffff',
                                color: isActive ? '#ffffff' : '#475569',
                                border: isActive ? '1px solid #2563eb' : '1px solid #e2e8f0',
                                boxShadow: isActive ? '0 4px 12px rgba(59,130,246,0.25)' : '0 1px 3px rgba(0,0,0,0.04)'
                            }}
                        >
                            <span style={{ fontSize: '1rem', display: 'flex', alignItems: 'center' }}>
                                {item.icon}
                            </span>
                            <span>{item.label}</span>
                            {item.badge !== null && item.badge !== undefined && (
                                <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    padding: '2px 7px',
                                    borderRadius: '12px',
                                    background: isActive ? 'rgba(255,255,255,0.25)' : (item.isPulse ? '#fee2e2' : '#f1f5f9'),
                                    color: isActive ? '#ffffff' : (item.isPulse ? '#dc2626' : '#1e293b'),
                                    border: isActive ? 'none' : '1px solid #e2e8f0'
                                }}>
                                    {item.badge}
                                </span>
                            )}
                        </NavLink>
                    );
                })}
            </div>
        </div>
    );
};

export default OTHeader;
