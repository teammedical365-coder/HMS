import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import { publicAPI, patientAuthAPI } from '../../utils/api';
import NeuralAuthPortal from '../../components/auth/NeuralAuthPortal';

const PatientPortalLogin = () => {
    const { loadBranding } = useBranding();
    const navigate = useNavigate();
    
    const [hospital, setHospital] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // OTP states
    const [otpStep, setOtpStep] = useState(null); // null | 'otp'
    const [preAuthToken, setPreAuthToken] = useState(null);
    const [otpRecipient, setOtpRecipient] = useState('');

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
    }, [loadBranding]);

    const handleLoginSubmit = async ({ id, password }) => {
        setErrorMsg('');
        setSuccessMsg('');

        if (!id || !password) {
            setErrorMsg('Email/Mobile and Password are required.');
            return;
        }

        if (!hospital?.id) {
            setErrorMsg('Hospital branding context is missing.');
            return;
        }

        setIsSubmitting(true);
        try {
            // Initiate Patient OTP Verification
            const res = await patientAuthAPI.sendOtp(id.trim(), password, hospital.id);
            if (res.success && res.preAuthToken) {
                setPreAuthToken(res.preAuthToken);
                setOtpRecipient(res.email || res.mobile || id);
                setOtpStep('otp');
                setSuccessMsg(res.message || 'Verification code transmitted.');
            } else {
                setErrorMsg(res.message || 'Failed to initiate OTP verification.');
            }
        } catch (err) {
            console.error('Patient Login error:', err);
            setErrorMsg(err.response?.data?.message || 'Invalid credentials or login failed.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleVerifyOtp = async (otp) => {
        if (!preAuthToken) return;
        setIsSubmitting(true);
        setErrorMsg('');

        try {
            const res = await patientAuthAPI.verifyOtp(preAuthToken, otp);
            if (res.success && res.token) {
                localStorage.setItem('patientToken', res.token);
                localStorage.setItem('patientUser', JSON.stringify(res.user));
                navigate('/patient/dashboard');
            } else {
                setErrorMsg(res.message || 'OTP verification failed.');
            }
        } catch (err) {
            console.error('Patient OTP verify error:', err);
            setErrorMsg(err.response?.data?.message || 'Incorrect OTP code.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResendOtp = async () => {
        if (!preAuthToken) return;
        setIsSubmitting(true);
        setErrorMsg('');
        setSuccessMsg('');

        try {
            const res = await patientAuthAPI.resendOtp(preAuthToken);
            if (res.success) {
                setSuccessMsg(res.message || 'New verification code transmitted.');
            } else {
                setErrorMsg(res.message || 'Failed to resend code.');
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.message || 'Failed to resend OTP.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAbortOtp = () => {
        setOtpStep(null);
        setPreAuthToken(null);
        setErrorMsg('');
        setSuccessMsg('');
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#030712', color: '#0ea5e9', fontFamily: 'JetBrains Mono, monospace' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '24px' }}></i>
                    <span>Initializing Patient Health Node...</span>
                </div>
            </div>
        );
    }

    const patientExtraFooter = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <Link to="/patient/forgot-password" style={{ color: '#64748b', textDecoration: 'none', fontWeight: 600, transition: 'color 0.2s' }}>
                    Forgot Secure Code?
                </Link>
                <Link to="/patient/signup" style={{ color: '#a855f7', fontWeight: 700, textDecoration: 'none' }}>
                    Register Patient Account →
                </Link>
            </div>
        </div>
    );

    return (
        <NeuralAuthPortal
            portalType="patient"
            title="Patient Portal"
            subtitle={`Access personal digital health records for ${hospital?.name || 'our patient network'}.`}
            idLabel="Mobile Number or Email"
            idPlaceholder="Enter registered mobile or email"
            idType="text"
            passkeyLabel="Password"
            passkeyPlaceholder="••••••••"
            branding={{
                name: hospital?.name,
                logoUrl: hospital?.logo
            }}
            onLoginSubmit={handleLoginSubmit}
            onVerifyOtp={handleVerifyOtp}
            onResendOtp={handleResendOtp}
            onAbortOtp={handleAbortOtp}
            otpStep={otpStep}
            otpEmail={otpRecipient}
            loading={isSubmitting}
            error={errorMsg}
            successMsg={successMsg}
            extraFooter={patientExtraFooter}
        />
    );
};

export default PatientPortalLogin;
