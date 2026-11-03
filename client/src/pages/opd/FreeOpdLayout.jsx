import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { useBranding } from '../../context/BrandingContext';
import { freeOpdAPI } from '../../utils/api';
import {
    FiUsers,
    FiActivity,
    FiCalendar,
    FiDollarSign,
    FiClock,
    FiLogOut,
    FiMenu,
    FiX,
    FiShield
} from 'react-icons/fi';
import './FreeOpdLayout.css';

const OPD_NAV_ITEMS = [
    {
        label: 'Appointment Management',
        path: '/opd/appointments',
        icon: <FiCalendar className="opd-nav-icon" />,
        desc: 'Book, reschedule, cancel, manage patient profiles & quota tracker'
    },
    {
        label: 'Doctor Patient Tray',
        path: '/opd/tray',
        icon: <FiActivity className="opd-nav-icon" />,
        desc: "Today's queue: Waiting, In Consultation & Completed"
    },
    {
        label: 'Payment & History',
        path: '/opd/money-tracker',
        icon: <FiDollarSign className="opd-nav-icon" />,
        desc: 'Record fees, cash/UPI collections & payment ledger'
    },
    {
        label: 'Revisit Schedule',
        path: '/opd/revisits',
        icon: <FiClock className="opd-nav-icon" />,
        desc: 'Follow-up tracking & upcoming visit bookings'
    }
];

const FreeOpdLayout = ({ children }) => {
    const { user } = useAuth();
    const { hospitalName } = useBranding();
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();

    const [mobileOpen, setMobileOpen] = useState(false);
    const [todayCount, setTodayCount] = useState(0);
    const [clockStr, setClockStr] = useState('');

    const clinicDisplayName = hospitalName && hospitalName !== 'Medical 365' 
        ? hospitalName 
        : (user?.hospitalName || user?.clinicName || 'Doctor OPD Clinic');

    const doctorName = user?.name ? `Dr. ${user.name.replace(/^Dr\.?\s*/i, '')}` : 'Consulting Doctor';
    const doctorSpecialty = user?.specialty || user?.services?.[0] || 'Solo Practitioner';

    // Live IST Clock
    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
            const dateStr = now.toLocaleDateString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: 'numeric',
                month: 'short'
            });
            setClockStr(`${dateStr} • ${timeStr} IST`);
        };
        updateTime();
        const timer = setInterval(updateTime, 10000);
        return () => clearInterval(timer);
    }, []);

    // Fetch Today's Appointment count for the 20/day Quota Meter
    useEffect(() => {
        let isMounted = true;
        const fetchQuota = async () => {
            try {
                const res = await freeOpdAPI.getTodayTray();
                if (res.success && isMounted) {
                    setTodayCount(res.summary?.total || res.todayAppointments?.length || 0);
                }
            } catch (_) {}
        };
        fetchQuota();
        const poll = setInterval(fetchQuota, 45000);
        return () => {
            isMounted = false;
            clearInterval(poll);
        };
    }, [location.pathname]);

    const handleLogout = async () => {
        try {
            await dispatch(logout()).unwrap();
        } catch (_) {}
        navigate('/login', { replace: true });
    };

    // Determine current active page details
    const activeNav = OPD_NAV_ITEMS.find(item => location.pathname.startsWith(item.path)) || OPD_NAV_ITEMS[0];

    const quotaClass = todayCount >= 20 
        ? 'limit-reached' 
        : todayCount >= 16 
        ? 'near-limit' 
        : '';

    return (
        <div className="opd-layout-container">
            {/* Mobile Drawer Overlay */}
            <div 
                className={`opd-mobile-overlay ${mobileOpen ? 'active' : ''}`}
                onClick={() => setMobileOpen(false)}
            />

            {/* SIDEBAR — Single Doctor OPD Navigation (Strictly 5 Modules) */}
            <aside className={`opd-sidebar ${mobileOpen ? 'open' : ''}`}>
                <div className="opd-sidebar-header">
                    <div className="opd-brand-logo">🏥</div>
                    <div className="opd-brand-info">
                        <div className="opd-clinic-name" title={clinicDisplayName}>
                            {clinicDisplayName}
                        </div>
                        <div className="opd-plan-badge">
                            🩺 Doctor OPD
                        </div>
                    </div>
                </div>

                <nav className="opd-sidebar-menu">
                    {OPD_NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => setMobileOpen(false)}
                            className={({ isActive }) => `opd-nav-item ${isActive ? 'active' : ''}`}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="opd-sidebar-footer">
                    <div className="opd-doctor-profile-card">
                        <div className="opd-doc-info">
                            <div className="opd-doc-name" title={doctorName}>{doctorName}</div>
                            <div className="opd-doc-role" title={doctorSpecialty}>{doctorSpecialty}</div>
                        </div>
                        <button
                            type="button"
                            className="opd-logout-btn"
                            title="Sign Out"
                            onClick={handleLogout}
                        >
                            <FiLogOut />
                        </button>
                    </div>
                </div>
            </aside>

            {/* MAIN CONTENT AREA */}
            <main className="opd-main-content">
                <header className="opd-topbar">
                    <div className="opd-topbar-left">
                        <button
                            type="button"
                            className="opd-menu-toggle"
                            onClick={() => setMobileOpen(prev => !prev)}
                            aria-label="Toggle Navigation Menu"
                        >
                            {mobileOpen ? <FiX /> : <FiMenu />}
                        </button>
                        <div className="opd-page-title-wrap">
                            <h2>{activeNav.label}</h2>
                            <p>{activeNav.desc}</p>
                        </div>
                    </div>

                    <div className="opd-topbar-right">
                        {/* Daily 20 Appointment Quota Meter */}
                        <div 
                            className={`opd-quota-badge ${quotaClass}`}
                            title="Daily quota is 20 appointments per day for Doctor OPD"
                        >
                            <span className="opd-quota-dot" />
                            <span>{todayCount} / 20 Appointments Today</span>
                        </div>

                        {/* Live IST Clock */}
                        {clockStr && (
                            <div className="opd-clock-badge">
                                <span>🕒</span>
                                <span>{clockStr}</span>
                            </div>
                        )}
                    </div>
                </header>

                <section className="opd-body-content">
                    {children || <Outlet />}
                </section>
            </main>
        </div>
    );
};

export default FreeOpdLayout;

