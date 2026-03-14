import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { adminAPI } from '../../utils/api';
import '../user/Signup.css';

const CentralAdminSignup = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '', email: '', password: '', confirmPassword: '', phone: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (!formData.name || !formData.email || !formData.password) {
            setError('Please fill in all required fields');
            setLoading(false);
            return;
        }
        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters long');
            setLoading(false);
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            setLoading(false);
            return;
        }

        try {
            const response = await adminAPI.signup(formData.name, formData.email, formData.password, formData.phone);
            if (response.success) {
                localStorage.setItem('token', response.token);
                localStorage.setItem('user', JSON.stringify(response.user));
                navigate('/supremeadmin');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error creating Central Admin account. Please try again.');
        } finally {
            setLoading(false);
        }
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
                        <h1>🏛️ Create Central Admin Account</h1>
                        <p>Set up the top-level administration account</p>
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label htmlFor="name">Full Name *</label>
                            <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} placeholder="Enter your full name" required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="email">Email Address *</label>
                            <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} placeholder="Enter your email" required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="phone">Phone Number</label>
                            <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange} placeholder="Enter your phone number (optional)" />
                        </div>
                        <div className="form-group">
                            <label htmlFor="password">Password *</label>
                            <input type="password" id="password" name="password" value={formData.password} onChange={handleChange} placeholder="Enter your password (min 6 characters)" required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="confirmPassword">Confirm Password *</label>
                            <input type="password" id="confirmPassword" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="Confirm your password" required />
                        </div>
                        <button type="submit" className="auth-button" disabled={loading}>
                            {loading ? 'Creating Account...' : 'Sign Up'}
                        </button>
                    </form>

                    <div className="auth-footer">
                        <p>
                            Already have a Central Admin account?{' '}
                            <Link to="/supremeadmin/login" className="auth-link">Sign In</Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CentralAdminSignup;
