import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import { publicAPI, patientAuthAPI } from '../../utils/api';
import './PatientPortalLogin.css'; // Reuse the premium styles from login

const PatientSignup = () => {
    const navigate = useNavigate();
    const { loadBranding } = useBranding();
    
    const [hospital, setHospital] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        mobile: '',
        email: '',
        password: '',
        confirmPassword: ''
    });

    useEffect(() => {
        const resolveHospital = async () => {
            try {
                setLoading(true);
                const domain = window.location.hostname;
                const res = await publicAPI.getTenantConfig(domain);
                
                if (res.success && res.tenant) {
                    setHospital({
                        id: res.tenant.id,
                        name: res.tenant.name,
                        logo: res.tenant.branding?.logoUrl
                    });
                    
                    if (res.tenant.id) {
                        loadBranding(res.tenant.id);
                    }
                }
            } catch (err) {
                console.error('Could not load hospital branding', err);
            } finally {
                setLoading(false);
            }
        };
        resolveHospital();
    }, []);

    const handleChange = (e) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
        setErrorMsg(''); // Clear error on typing
    };

    const validateForm = () => {
        if (!formData.name.trim()) return "Full Name is required.";
        if (!formData.mobile.trim()) return "Mobile Number is required.";
        if (!formData.email.trim()) return "Email Address is required.";
        if (!formData.password) return "Password is required.";
        if (!formData.confirmPassword) return "Confirm Password is required.";
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) return "Please enter a valid email address.";
        
        const mobileRegex = /^[0-9]{10,15}$/;
        if (!mobileRegex.test(formData.mobile)) return "Please enter a valid mobile number (10-15 digits).";
        
        if (formData.password.length < 8) return "Password must be at least 8 characters long.";
        
        if (formData.password !== formData.confirmPassword) return "Passwords do not match.";

        return null;
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        
        const validationError = validateForm();
        if (validationError) {
            setErrorMsg(validationError);
            return;
        }

        if (!hospital?.id) {
            setErrorMsg("Hospital context not found. Please refresh the page.");
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await patientAuthAPI.register(
                formData.name,
                formData.email,
                formData.mobile,
                formData.password,
                hospital.id
            );

            if (response.success) {
                alert("Your account has been created successfully. Please login to continue.");
                navigate('/patient');
            }
        } catch (err) {
            console.error('Registration error', err);
            if (err.response?.data?.message) {
                setErrorMsg(err.response.data.message);
            } else {
                setErrorMsg("Failed to create account. Please try again later.");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="patient-portal-container">
                <div style={{ color: '#3b82f6', fontWeight: 600 }}>Loading Portal...</div>
            </div>
        );
    }

    return (
        <div className="patient-portal-container">
            <div className="patient-portal-card" style={{ maxWidth: '500px' }}>
                <div className="hospital-branding">
                    {hospital?.logo ? (
                        <img src={hospital.logo} alt="Hospital Logo" />
                    ) : (
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏥</div>
                    )}
                    <h1>{hospital?.name || 'Welcome to Our Hospital'}</h1>
                    <div className="portal-title">Create Patient Account</div>
                </div>

                {errorMsg && (
                    <div style={{ width: '100%', padding: '12px', marginBottom: '16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', fontSize: '0.9rem', textAlign: 'center' }}>
                        {errorMsg}
                    </div>
                )}

                <form className="patient-login-form" onSubmit={handleSignup}>
                    <div className="input-group">
                        <label>Full Name</label>
                        <input type="text" name="name" placeholder="John Doe" value={formData.name} onChange={handleChange} required />
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div className="input-group" style={{ flex: 1 }}>
                            <label>Mobile Number</label>
                            <input type="text" name="mobile" placeholder="9876543210" value={formData.mobile} onChange={handleChange} required />
                        </div>
                        <div className="input-group" style={{ flex: 1 }}>
                            <label>Email Address</label>
                            <input type="email" name="email" placeholder="john@example.com" value={formData.email} onChange={handleChange} required />
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div className="input-group" style={{ flex: 1 }}>
                            <label>Password</label>
                            <input type="password" name="password" placeholder="Min. 8 characters" value={formData.password} onChange={handleChange} required />
                        </div>
                        <div className="input-group" style={{ flex: 1 }}>
                            <label>Confirm Password</label>
                            <input type="password" name="confirmPassword" placeholder="Confirm password" value={formData.confirmPassword} onChange={handleChange} required />
                        </div>
                    </div>

                    <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: '1rem' }}>
                        {isSubmitting ? 'Creating Account...' : 'Sign Up'}
                    </button>
                </form>

                <div className="divider">Already have an account?</div>

                <Link to="/patient" style={{ width: '100%', textDecoration: 'none' }}>
                    <button type="button" className="btn-secondary" style={{ width: '100%' }}>
                        Go to Login
                    </button>
                </Link>
            </div>
        </div>
    );
};

export default PatientSignup;
