import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import { publicAPI, patientAuthAPI } from '../../utils/api';
import './PatientPortalLogin.css';

const PatientResetPassword = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { loadBranding } = useBranding();
    
    const [hospital, setHospital] = useState(null);
    const [loading, setLoading] = useState(true);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    
    const token = searchParams.get('token');

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

        if (!token) {
            setErrorMsg('Invalid or missing password reset token.');
            return;
        }

        if (!password || !confirmPassword) {
            setErrorMsg('Password and confirm password are required.');
            return;
        }

        if (password.length < 8) {
            setErrorMsg('Password must be at least 8 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            setErrorMsg('Passwords do not match.');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await patientAuthAPI.resetPassword(token, password);
            if (res.success) {
                setSuccessMsg('Your password has been successfully reset.');
                alert('Your password has been reset successfully. Please login to continue.');
                navigate('/patient');
            }
        } catch (err) {
            console.error('Reset password error:', err);
            setErrorMsg(err.response?.data?.message || 'Failed to reset password. The link may have expired.');
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
                    <div className="portal-title">New Password</div>
                </div>

                {!token ? (
                    <div style={{ width: '100%', textAlign: 'center' }}>
                        <div style={{ padding: '12px', marginBottom: '16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', fontSize: '0.9rem' }}>
                            Invalid or missing password reset token. Please request a new link.
                        </div>
                        <Link to="/patient/forgot-password" style={{ textDecoration: 'none', width: '100%' }}>
                            <button type="button" className="btn-primary" style={{ width: '100%' }}>
                                Request New Link
                            </button>
                        </Link>
                    </div>
                ) : (
                    <>
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

                        <form className="patient-login-form" onSubmit={handleSubmit}>
                            <div className="input-group">
                                <label>New Password</label>
                                <input 
                                    type="password" 
                                    placeholder="Enter new password (min 8 chars)" 
                                    required 
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); setErrorMsg(''); }}
                                />
                            </div>

                            <div className="input-group">
                                <label>Confirm New Password</label>
                                <input 
                                    type="password" 
                                    placeholder="Confirm new password" 
                                    required 
                                    value={confirmPassword}
                                    onChange={(e) => { setConfirmPassword(e.target.value); setErrorMsg(''); }}
                                />
                            </div>

                            <button type="submit" className="btn-primary" disabled={isSubmitting}>
                                {isSubmitting ? 'Resetting...' : 'Update Password'}
                            </button>
                        </form>
                    </>
                )}

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

export default PatientResetPassword;
