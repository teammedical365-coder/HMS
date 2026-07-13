import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import { publicAPI, patientAuthAPI } from '../../utils/api';
import './PatientPortalLogin.css';

const PatientPortalLogin = () => {
    const { loadBranding } = useBranding();
    const navigate = useNavigate();
    
    const [hospital, setHospital] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

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

    const handleLogin = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (!loginId.trim() || !password) {
            setErrorMsg('Email/Mobile and Password are required.');
            return;
        }

        if (!hospital?.id) {
            setErrorMsg('Hospital branding context is missing.');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await patientAuthAPI.login(loginId.trim(), password, hospital.id);
            if (res.success) {
                localStorage.setItem('patientToken', res.token);
                localStorage.setItem('patientUser', JSON.stringify(res.user));
                navigate('/patient/dashboard');
            }
        } catch (err) {
            console.error('Login error:', err);
            setErrorMsg(err.response?.data?.message || 'Invalid credentials or login failed.');
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
                    <div className="portal-title">Patient Portal</div>
                </div>

                {errorMsg && (
                    <div style={{ width: '100%', padding: '10px', marginBottom: '16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', fontSize: '0.9rem', textAlign: 'center' }}>
                        {errorMsg}
                    </div>
                )}

                <form className="patient-login-form" onSubmit={handleLogin}>
                    <div className="input-group">
                        <label>Mobile Number / Email</label>
                        <input 
                            type="text" 
                            placeholder="Enter your registered mobile or email" 
                            required 
                            value={loginId}
                            onChange={(e) => { setLoginId(e.target.value); setErrorMsg(''); }}
                        />
                    </div>
                    
                    <div className="input-group">
                        <label>Password</label>
                        <input 
                            type="password" 
                            placeholder="Enter your password" 
                            required 
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setErrorMsg(''); }}
                        />
                    </div>

                    <Link to="/patient/forgot-password" style={{ alignSelf: 'flex-end', textDecoration: 'none' }}>
                        <button type="button" className="forgot-password">
                            Forgot Password?
                        </button>
                    </Link>

                    <button type="submit" className="btn-primary" disabled={isSubmitting}>
                        {isSubmitting ? 'Logging in...' : 'Secure Login'}
                    </button>
                </form>

                <div className="divider">New to our portal?</div>

                <Link to="/patient/signup" style={{ width: '100%', textDecoration: 'none' }}>
                    <button type="button" className="btn-secondary" style={{ width: '100%' }}>
                        Create Patient Account
                    </button>
                </Link>
            </div>
        </div>
    );
};

export default PatientPortalLogin;
