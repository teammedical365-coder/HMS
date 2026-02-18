import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../store/hooks';
import { logout } from '../store/slices/authSlice';
import './Navbar.css';

const Navbar = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { isAuthenticated, user } = useAuth();

  const handleLogout = () => {
    dispatch(logout());
    navigate('/');
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

          {/* Dynamic nav links from the user's role */}
          {isAuthenticated && navLinks.map((link, index) => (
            <NavLink
              key={`${link.path}-${index}`}
              to={link.path}
              className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
            >
              {link.label}
            </NavLink>
          ))}

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