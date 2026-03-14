import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { loginHospitalAdmin, clearError } from '../../store/slices/authSlice';
import '../user/Login.css';

const HospitalAdminLogin = () => {
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const { loading, error, isAuthenticated, user } = useAuth();

    const [formData, setFormData] = useState({ email: '', password: '' });

    useEffect(() => {
        dispatch(clearError());
    }, [dispatch]);

    useEffect(() => {
        if (isAuthenticated && user) {
            const role = user.role?.toLowerCase();
            if (role === 'hospitaladmin') {
                navigate('/hospitaladmin');
            } else if (role === 'centraladmin' || role === 'superadmin') {
                navigate('/supremeadmin');
            }
        }
    }, [isAuthenticated, user, navigate]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        dispatch(clearError());
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        dispatch(clearError());
        if (!formData.email || !formData.password) return;
        await dispatch(loginHospitalAdmin({ email: formData.email, password: formData.password }));
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-card">
                    <button onClick={() => navigate('/')} className="back-button" type="button">
                        <span className="back-icon">←</span>
                        <span>Go Back</span>
                    </button>

                    <div className="auth-header">
                        <h1>🏥 Hospital Admin Login</h1>
                        <p>Sign in to your Hospital Administration Portal</p>
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label htmlFor="email">Email Address</label>
                            <input
                                type="email" id="email" name="email" value={formData.email}
                                onChange={handleChange} placeholder="Enter your email" required
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <input
                                type="password" id="password" name="password" value={formData.password}
                                onChange={handleChange} placeholder="Enter your password" required
                            />
                        </div>
                        <button type="submit" className="auth-button" disabled={loading}>
                            {loading ? 'Signing In...' : 'Sign In'}
                        </button>
                    </form>

                    <div className="auth-footer">
                        <p style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-gray)' }}>
                            Central Admin?{' '}
                            <Link to="/supremeadmin/login" className="auth-link" style={{ fontSize: '0.85rem' }}>
                                Central Admin Login
                            </Link>
                        </p>
                        <p style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-gray)' }}>
                            Regular users should use{' '}
                            <Link to="/login" className="auth-link" style={{ fontSize: '0.85rem' }}>
                                user login
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HospitalAdminLogin;
