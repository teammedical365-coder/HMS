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

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Logo/Brand */}
        <NavLink to="/" className="navbar-brand">
          <img src="/nav-logo.png" alt="Krisna IVF Logo" className="navbar-logo" />
          {/* <span className="brand-text">Krisna IVF</span> */}
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
         
          {/* Show user links only for regular users (not admin, not doctor, not lab, NOT PHARMACY, NOT RECEPTION) */}
          {user?.role !== 'admin' && user?.role !== 'doctor' && user?.role !== 'lab' && user?.role !== 'pharmacy' && user?.role !== 'reception' && (
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
              
              {isAuthenticated && (
                <NavLink 
                  to="/lab-reports" 
                  className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
                >
                  Lab Reports
                </NavLink>
              )}
              
              {isAuthenticated && (
                <NavLink 
                  to="/dashboard" 
                  className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
                >
                  Dashboard
                </NavLink>
              )}
            </>
          )}

          {/* Show Pharmacy links only for Pharmacy users */}
          {user?.role === 'pharmacy' && isAuthenticated && (
            <>
              <NavLink 
                to="/pharmacy/inventory" 
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                Inventory
              </NavLink>
              <NavLink 
                to="/pharmacy/orders" 
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                Orders
              </NavLink>
            </>
          )}
          
          {/* Show doctor link only for doctors */}
          {user?.role === 'doctor' && isAuthenticated && (
            <NavLink 
              to="/doctor/patients" 
              className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
            >
              Patients
            </NavLink>
          )}

          {/* Show Lab links only for Lab users */}
          {user?.role === 'lab' && isAuthenticated && (
            <>
              <NavLink 
                to="/lab/dashboard" 
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                Dashboard
              </NavLink>
              <NavLink 
                to="/lab/assigned-tests" 
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                Assigned Tests
              </NavLink>
              <NavLink 
                to="/lab/completed-reports" 
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                Completed Reports
              </NavLink>
            </>
          )}

          {/* Show Reception links only for Reception users */}
          {user?.role === 'reception' && isAuthenticated && (
            <NavLink 
              to="/reception/dashboard" 
              className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
            >
              Dashboard
            </NavLink>
          )}

          {/* Show admin links only for admins */}
          {user?.role === 'admin' && isAuthenticated && (
            <>
              <NavLink 
                to="/admin" 
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                Admin
              </NavLink>
              <NavLink 
                to="/admin/doctors" 
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                Doctors
              </NavLink>
              <NavLink 
                to="/admin/labs" 
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                Labs
              </NavLink>
              <NavLink 
                to="/admin/pharmacy" 
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                Pharmacy
              </NavLink>
              <NavLink 
                to="/admin/reception" 
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                Reception
              </NavLink>
              <NavLink 
                to="/admin/services" 
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                Services
              </NavLink>
            </>
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
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <span className="dropdown-icon">🔐</span>
                    Login
                  </NavLink>
                  <NavLink 
                    to="/signup" 
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <span className="dropdown-icon">✍️</span>
                    Sign Up
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