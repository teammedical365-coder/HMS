import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import { publicAPI, patientAuthAPI } from '../../utils/api';
import './PatientPortalLogin.css';

const PatientForgotPassword = () => {
    const { loadBranding } = useBranding();
    
    const [hospital, setHospital] = useState(null);
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [resetLink, setResetLink] = useState('');

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');
        setResetLink('');

        if (!email.trim()) {
            setErrorMsg('Email Address is required.');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await patientAuthAPI.forgotPassword(email.trim(), hospital.id);
            if (res.success) {
                setSuccessMsg('Reset link generated successfully.');
                
                // Construct a clickable reset link on screen for local testing!
                const token = res.token;
                const link = `${window.location.protocol}//${window.location.host}/patient/reset-password?token=${token}`;
                setResetLink(link);
            }
        } catch (err) {
            console.error('Forgot password error:', err);
            setErrorMsg(err.response?.data?.message || 'Failed to process request.');
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
            <div className="patient-portal-card">
                <div className="hospital-branding">
                    {hospital?.logo ? (
                        <img src={hospital.logo} alt="Hospital Logo" />
                    ) : (
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏥</div>
                    )}
                    <h1>{hospital?.name || 'Welcome to Our Hospital'}</h1>
                    <div className="portal-title">Reset Password</div>
                </div>

                {errorMsg && (
                    <div style={{ width: '100%', padding: '10px', marginBottom: '16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', fontSize: '0.9rem', textAlign: 'center' }}>
                        {errorMsg}
                    </div>
                )}

                {successMsg && (
                    <div style={{ width: '100%', padding: '12px', marginBottom: '16px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: '8px', fontSize: '0.9rem', textAlign: 'center' }}>
                        {successMsg}
                    </div>
                )}

                {resetLink && (
                    <div style={{ width: '100%', padding: '12px', marginBottom: '16px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: '8px', fontSize: '0.85rem', textAlign: 'left', wordBreak: 'break-all' }}>
                        <strong>[Mock Email Link]:</strong><br />
                        <Link to={`/patient/reset-password?token=${resetLink.split('token=')[1]}`} style={{ color: '#2563eb', fontWeight: 'bold' }}>
                            Click here to reset your password
                        </Link>
                    </div>
                )}

                <form className="patient-login-form" onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label>Registered Email Address</label>
                        <input 
                            type="email" 
                            placeholder="Enter your email address" 
                            required 
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
                        />
                    </div>

                    <button type="submit" className="btn-primary" disabled={isSubmitting}>
                        {isSubmitting ? 'Sending...' : 'Get Reset Link'}
                    </button>
                </form>

                <div className="divider">Or remember your password?</div>

                <Link to="/patient" style={{ width: '100%', textDecoration: 'none' }}>
                    <button type="button" className="btn-secondary" style={{ width: '100%' }}>
                        Back to Login
                    </button>
                </Link>
            </div>
        </div>
    );
};

export default PatientForgotPassword;
