import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAuth, useNotifications } from '../store/hooks';
import { logout } from '../store/slices/authSlice';
import { fetchNotifications, markAsRead } from '../store/slices/notificationSlice';
import { FiBell, FiChevronDown, FiLogOut, FiLogIn, FiHome, FiSettings } from 'react-icons/fi';
import { useBranding } from '../context/BrandingContext';
import './Navbar.css';

/* ---- Brand Logo ---- */
const BrandLogo = () => (
  <img src="logo.png" alt="Medical 365" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
);

const Navbar = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { isAuthenticated, user } = useAuth();
  const { items: notifications, unreadCount } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const { branding } = useBranding();

  useEffect(() => {
    if (isAuthenticated && user) {
      dispatch(fetchNotifications());
    }
  }, [isAuthenticated, user, dispatch]);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/');
  };

  const handleNotificationClick = (id) => {
    dispatch(markAsRead(id));
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">

        {/* Logo/Brand */}
        <NavLink to="/" className="navbar-brand">
          <div className="navbar-logo-icon">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.appName || 'Medical 365'} className="navbar-custom-logo" />
            ) : (
              <BrandLogo />
            )}
          </div>
          {!branding.logoUrl && (
            <div className="navbar-logo-text">
              <span className="navbar-logo-main">{branding.appName || 'Medical 365'}</span>
              <span className="navbar-logo-sub">{branding.tagline || 'Healthcare Suite'}</span>
            </div>
          )}
        </NavLink>

        {/* Navigation Links */}
        <div className="navbar-links">

          {isAuthenticated && user && (
            <NavLink
              to={user.dashboardPath || '/'}
              className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
            >
              <FiHome size={15} />
              Dashboard
            </NavLink>
          )}

          <div className="nav-divider" />

          {/* Notifications */}
          {isAuthenticated && (
            <div className="nav-item notification-wrapper" onMouseLeave={() => setShowNotifications(false)}>
              <button
                className="notification-btn"
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label="Notifications"
              >
                <FiBell size={18} />
                {unreadCount > 0 && (
                  <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </button>

              {showNotifications && (
                <div className="notification-dropdown">
                  <div className="notification-header">
                    <h4>Notifications</h4>
                    {unreadCount > 0 && <span className="badge badge-danger">{unreadCount} new</span>}
                  </div>
                  <div className="notification-list">
                    {notifications.length === 0 ? (
                      <p className="no-notifications">🔔 You're all caught up!</p>
                    ) : (
                      notifications.slice(0, 6).map(notif => (
                        <div
                          key={notif._id}
                          className={`notification-item ${notif.status === 'Unread' ? 'unread' : ''}`}
                          onClick={() => handleNotificationClick(notif._id)}
                        >
                          <p className="notification-msg">{notif.message}</p>
                          <small className="notification-time">
                            {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </small>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="notification-footer">
                    <button onClick={() => navigate(user?.dashboardPath || '/')}>
                      View all notifications →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Settings / User Dropdown */}
          <div className="settings-dropdown">
            <div className="nav-link settings-link">
              {isAuthenticated && user ? (
                <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--brand-600)' }}>
                  {(user.name || 'User').split(' ')[0]}
                </span>
              ) : (
                <FiSettings size={15} />
              )}
              <FiChevronDown size={12} className="dropdown-arrow" />
            </div>

            <div className="dropdown-menu">
              {isAuthenticated ? (
                <>
                  {user && (
                    <div className="dropdown-user-info">
                      <span className="user-name">{user.name}</span>
                      <span className="user-email">{user.email}</span>
                      {user.role && <span className="user-role-badge">{user.role}</span>}
                    </div>
                  )}
                  <button className="dropdown-item logout-btn" onClick={handleLogout}>
                    <span className="dropdown-icon"><FiLogOut size={15} /></span>
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <NavLink to="/login" className="dropdown-item">
                    <span className="dropdown-icon"><FiLogIn size={15} /></span>
                    Staff Login
                  </NavLink>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </nav>
  );
};

export default Navbar;