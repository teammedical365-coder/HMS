import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAuth, useNotifications } from '../store/hooks';
import { logout } from '../store/slices/authSlice';
import { fetchNotifications, markAsRead } from '../store/slices/notificationSlice';
import { FiBell } from 'react-icons/fi';
import './Navbar.css';

const Navbar = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { isAuthenticated, user } = useAuth();
  const { items: notifications, unreadCount } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);

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

  // Get dynamic nav links from the user's role data
  const navLinks = user?.navLinks || [];

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Logo/Brand */}
        <NavLink to="/" className="navbar-brand">
          <img src="/nav-logo.png" alt="Krisna IVF Logo" className="navbar-logo" />
        </NavLink>

        {/* Navigation Links */}
        <div className="navbar-links">
          <NavLink
            to="/"
            className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
            end
          >
            Home
          </NavLink>

          {/* Show public links (Services, Doctors, Appointment) for non-authenticated users */}
          {!isAuthenticated && (
            <>
              <NavLink
                to="/services"
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                Services
              </NavLink>
              <NavLink
                to="/doctors"
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                Doctors
              </NavLink>
              <NavLink
                to="/appointment"
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                Appointment
              </NavLink>
            </>
          )}

          {/* Dynamic nav links removed from header body to keep UI clean, replaced with central 'Dashboard' link */}
          {isAuthenticated && user && (
            <NavLink
              to={user.dashboardPath || '/'}
              className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
            >
              Dashboard
            </NavLink>
          )}

          {isAuthenticated && (
            <div className="nav-item notification-wrapper" onMouseLeave={() => setShowNotifications(false)}>
              <button className="notification-btn" onClick={() => setShowNotifications(!showNotifications)}>
                <FiBell size={20} />
                {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
              </button>

              {showNotifications && (
                <div className="notification-dropdown">
                  <div className="notification-header">
                    <h4>Notifications</h4>
                  </div>
                  <div className="notification-list">
                    {notifications.length === 0 ? (
                      <p className="no-notifications">No new notifications.</p>
                    ) : (
                      notifications.slice(0, 5).map(notif => (
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
                    <button onClick={() => navigate(user?.dashboardPath || '/dashboard')}>View Dashboard</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Settings Dropdown */}
          <div className="settings-dropdown">
            <div className="nav-link settings-link">
              Settings
              <span className="dropdown-arrow">▼</span>
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
                  <button
                    className="dropdown-item logout-btn"
                    onClick={handleLogout}
                  >
                    <span className="dropdown-icon">🚪</span>
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <NavLink
                    to="/login"
                    className="dropdown-item"
                    onClick={(e) => { e.stopPropagation(); }}
                  >
                    <span className="dropdown-icon">🔐</span>
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