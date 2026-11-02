import React, { useState } from 'react';
import { publicAPI } from '../../utils/api';
import './FreeOpdSignup.css';

const SPECIALTIES = [
    'General Physician',
    'Pediatrics / Child Specialist',
    'Gynecology & Obstetrics',
    'Orthopedics',
    'Dermatology',
    'Cardiology',
    'ENT Specialist',
    'Ophthalmology / Eye',
    'Dental Surgery',
    'Psychiatry',
    'Pulmonology / Chest',
    'Ayurveda / Homeopathy',
    'Other Specialist'
];

const FreeOpdSignup = () => {
    const [formData, setFormData] = useState({
        clinicName: '',
        address: '',
        city: '',
        state: '',
        pincode: '',
        doctorName: '',
        doctorEmail: '',
        doctorPhone: '',
        specialization: 'General Physician',
        qualification: 'MBBS',
        password: '',
        confirmPassword: '',
        consultationFee: ''
    });

    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [apiError, setApiError] = useState('');
    const [signupResult, setSignupResult] = useState(null);
    const [copied, setCopied] = useState(false);
    const [resendingEmail, setResendingEmail] = useState(false);
    const [emailResentMsg, setEmailResentMsg] = useState('');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
        if (apiError) setApiError('');
    };

    const validate = () => {
        const errs = {};
        if (!formData.clinicName.trim() || formData.clinicName.trim().length < 2) {
            errs.clinicName = 'Clinic name must be at least 2 characters';
        }
        if (!formData.doctorName.trim() || formData.doctorName.trim().length < 2) {
            errs.doctorName = 'Doctor full name must be at least 2 characters';
        }
        const normalizedEmail = formData.doctorEmail.trim().toLowerCase();
        if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
            errs.doctorEmail = 'Valid email address is required (e.g. doctor@example.com)';
        }
        const cleanedPhone = formData.doctorPhone.replace(/\D/g, '').slice(-10);
        if (cleanedPhone.length !== 10) {
            errs.doctorPhone = 'Valid 10-digit mobile number is required';
        }
        if (!formData.password || formData.password.length < 8) {
            errs.password = 'Password must be at least 8 characters';
        } else if (!/[a-zA-Z]/.test(formData.password) || !/[0-9]/.test(formData.password)) {
            errs.password = 'Password must include both letters and numbers';
        }
        if (formData.password !== formData.confirmPassword) {
            errs.confirmPassword = 'Passwords do not match';
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Prevent accidental double-click form submission
        if (submitting) return;

        setApiError('');
        if (!validate()) return;

        setSubmitting(true);
        try {
            const payload = {
                clinicName: formData.clinicName.trim(),
                address: formData.address.trim(),
                city: formData.city.trim(),
                state: formData.state.trim(),
                pincode: formData.pincode.trim(),
                doctorName: formData.doctorName.trim(),
                doctorEmail: formData.doctorEmail.trim().toLowerCase(),
                doctorPhone: formData.doctorPhone.replace(/\D/g, '').slice(-10),
                specialization: formData.specialization,
                qualification: formData.qualification.trim(),
                password: formData.password,
                consultationFee: Number(formData.consultationFee) || 0
            };

            const res = await publicAPI.freeOpdSignup(payload);
            if (res.success) {
                setSignupResult(res);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                setApiError(res.message || 'Registration failed. Please check details.');
            }
        } catch (err) {
            console.error('Free OPD Signup error:', err);
            const msg = err.response?.data?.message || err.message || 'Registration failed. Please check your network and try again.';
            setApiError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleCopyUrl = () => {
        if (!signupResult) return;
        const targetUrl = signupResult.clinicUrl || `${window.location.origin}/login?slug=${signupResult.clinic?.slug}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(targetUrl).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 3000);
            }).catch(() => fallbackCopy(targetUrl));
        } else {
            fallbackCopy(targetUrl);
        }
    };

    const fallbackCopy = (text) => {
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
        } catch (e) {
            console.error('Copy failed:', e);
        }
    };

    const handleResendEmail = async () => {
        if (!signupResult?.doctor?.email || resendingEmail) return;
        setResendingEmail(true);
        setEmailResentMsg('');
        try {
            const res = await publicAPI.resendWelcomeEmail({ email: signupResult.doctor.email });
            if (res.success) {
                setEmailResentMsg('✓ Welcome confirmation email resent to your inbox!');
            } else {
                setEmailResentMsg(res.message || 'Could not resend email. Please check spam folder.');
            }
        } catch (err) {
            setEmailResentMsg('Failed to resend confirmation email. Please try again.');
        } finally {
            setResendingEmail(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRATION SUCCESS VIEW
    // ═══════════════════════════════════════════════════════════════════════════
    if (signupResult) {
        const { clinic, doctor, clinicUrl, loginUrl, devLoginUrl } = signupResult;
        const isLocal = window.location.hostname.includes('localhost') || window.location.hostname === '127.0.0.1';
        const effectiveLoginUrl = isLocal 
            ? `${window.location.origin}${devLoginUrl}`
            : (loginUrl || clinicUrl);

        return (
            <div className="fos-page-wrapper">
                <header className="fos-brand-bar">
                    <div className="fos-logo-container">
                        <div className="fos-logo-symbol">🏥</div>
                        <div className="fos-logo-text">Medical<span>365</span></div>
                    </div>
                </header>

                <div className="fos-card fos-success-view">
                    <div className="fos-success-badge-icon">✓</div>
                    <h1 className="fos-success-title">Your Free Doctor OPD Clinic is Ready!</h1>
                    <p className="fos-success-subtitle">
                        Congratulations, <strong>{doctor.name}</strong>! Your autonomous digital clinic workspace has been created.
                    </p>

                    {/* Clinic Summary */}
                    <div className="fos-result-box">
                        <div className="fos-result-row">
                            <span className="fos-result-label">Clinic Name:</span>
                            <span className="fos-result-val">{clinic.name}</span>
                        </div>
                        <div className="fos-result-row">
                            <span className="fos-result-label">Practitioner:</span>
                            <span className="fos-result-val">{doctor.name} ({doctor.specialty})</span>
                        </div>
                        <div className="fos-result-row">
                            <span className="fos-result-label">Registered Email:</span>
                            <span className="fos-result-val">{doctor.email}</span>
                        </div>
                        <div className="fos-result-row">
                            <span className="fos-result-label">Subscription Tier:</span>
                            <span className="fos-result-val" style={{ color: '#0d9488' }}>Free Doctor OPD (₹0 Forever)</span>
                        </div>
                        <div className="fos-result-row">
                            <span className="fos-result-label">Appointment Quota:</span>
                            <span className="fos-result-val">20 Appointments / Calendar Day</span>
                        </div>
                    </div>

                    {/* Dedicated Clinic URL */}
                    <div className="fos-url-card">
                        <div className="fos-url-header">
                            <span>Your Dedicated Clinic Web Address</span>
                            <span style={{ fontSize: '11px', color: '#0f766e', fontWeight: 600 }}>SSL Protected</span>
                        </div>
                        <div className="fos-url-display-wrap">
                            <input
                                type="text"
                                className="fos-url-input"
                                value={clinicUrl}
                                readOnly
                                onClick={(e) => e.target.select()}
                            />
                            <button
                                type="button"
                                className={`fos-copy-btn ${copied ? 'copied' : ''}`}
                                onClick={handleCopyUrl}
                            >
                                {copied ? '✓ Copied!' : '📋 Copy URL'}
                            </button>
                        </div>
                    </div>

                    {/* Login Walkthrough (Email OTP) */}
                    <div className="fos-login-steps-card">
                        <div className="fos-steps-title">
                            <span>🔑</span>
                            <span>How to Sign In (Secure Email OTP)</span>
                        </div>
                        <ol className="fos-steps-list">
                            <li>Visit your clinic URL above, or click <strong>Proceed to Clinic Login</strong> below.</li>
                            <li>Sign in using your registered email (<strong>{doctor.email}</strong>) and password.</li>
                            <li>A secure <strong>6-digit Email OTP</strong> will be automatically sent to this email address.</li>
                            <li>Enter the OTP to access your Doctor Dashboard and start managing appointments.</li>
                        </ol>
                    </div>

                    {/* Action Buttons */}
                    <div className="fos-success-actions">
                        <a
                            href={effectiveLoginUrl}
                            className="fos-primary-btn"
                        >
                            🚀 Proceed to Clinic Login
                        </a>
                        <button
                            type="button"
                            className="fos-secondary-btn"
                            onClick={handleResendEmail}
                            disabled={resendingEmail}
                        >
                            {resendingEmail ? 'Sending...' : '✉️ Resend Confirmation Email'}
                        </button>
                    </div>

                    {emailResentMsg && (
                        <p className="fos-resend-status">
                            {emailResentMsg}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRATION FORM VIEW
    // ═══════════════════════════════════════════════════════════════════════════
    return (
        <div className="fos-page-wrapper">
            {/* Top Brand Bar */}
            <header className="fos-brand-bar">
                <a href="/login" className="fos-logo-container">
                    <div className="fos-logo-symbol">🏥</div>
                    <div className="fos-logo-text">Medical<span>365</span></div>
                </a>
                <a href="/login" className="fos-nav-link">
                    Already registered? Sign In →
                </a>
            </header>

            {/* Hero Section */}
            <div className="fos-hero">
                <div className="fos-trust-badge">
                    <span>✨</span>
                    <span>100% Free Forever • Zero Subscription Fee • Designed for Solo Doctors</span>
                </div>
                <h1 className="fos-title">
                    Launch Your Free <span>Digital OPD Clinic</span>
                </h1>
                <p className="fos-subtitle">
                    Modern appointment management, patient monitoring, and digital prescriptions built exclusively for solo practitioners and independent clinics.
                </p>
            </div>

            {/* Feature Highlights Grid */}
            <div className="fos-features-grid">
                <div className="fos-feature-card">
                    <div className="fos-feature-icon">👨‍⚕️</div>
                    <div className="fos-feature-title">1 Solo Doctor</div>
                    <div className="fos-feature-desc">Autonomous OPD practice</div>
                </div>
                <div className="fos-feature-card">
                    <div className="fos-feature-icon">📅</div>
                    <div className="fos-feature-title">20 Appts / Day</div>
                    <div className="fos-feature-desc">Daily renewal quota</div>
                </div>
                <div className="fos-feature-card">
                    <div className="fos-feature-icon">📂</div>
                    <div className="fos-feature-title">Unlimited Records</div>
                    <div className="fos-feature-desc">Full history & prescriptions</div>
                </div>
                <div className="fos-feature-card">
                    <div className="fos-feature-icon">⚡</div>
                    <div className="fos-feature-title">₹0 / Month</div>
                    <div className="fos-feature-desc">No credit card required</div>
                </div>
            </div>

            {/* Main Form Card */}
            <div className="fos-card">
                {apiError && (
                    <div className="fos-alert fos-alert-error">
                        <span style={{ fontSize: '18px' }}>⚠️</span>
                        <div>
                            <strong>Registration Notice: </strong>
                            <span>{apiError}</span>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                    {/* SECTION 1: CLINIC DETAILS */}
                    <div className="fos-section">
                        <div className="fos-section-header">
                            <div className="fos-section-icon-badge">🏥</div>
                            <div>
                                <h3 className="fos-section-title">Clinic Details</h3>
                                <p className="fos-section-desc">Basic details for your clinical establishment</p>
                            </div>
                        </div>

                        <div className="fos-form-grid">
                            <div className="fos-form-group full-width">
                                <label className="fos-label">
                                    Clinic Name <span className="req">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="clinicName"
                                    className={`fos-input ${errors.clinicName ? 'error' : ''}`}
                                    placeholder="e.g. LifeCare OPD & PolyClinic"
                                    value={formData.clinicName}
                                    onChange={handleChange}
                                    disabled={submitting}
                                />
                                {errors.clinicName && <span className="fos-error-text">⚠ {errors.clinicName}</span>}
                            </div>

                            <div className="fos-form-group full-width">
                                <label className="fos-label">Complete Address</label>
                                <input
                                    type="text"
                                    name="address"
                                    className="fos-input"
                                    placeholder="e.g. Shop 4, Ground Floor, Central Market"
                                    value={formData.address}
                                    onChange={handleChange}
                                    disabled={submitting}
                                />
                            </div>

                            <div className="fos-form-group">
                                <label className="fos-label">City</label>
                                <input
                                    type="text"
                                    name="city"
                                    className="fos-input"
                                    placeholder="e.g. New Delhi"
                                    value={formData.city}
                                    onChange={handleChange}
                                    disabled={submitting}
                                />
                            </div>

                            <div className="fos-form-group">
                                <label className="fos-label">State</label>
                                <input
                                    type="text"
                                    name="state"
                                    className="fos-input"
                                    placeholder="e.g. Delhi"
                                    value={formData.state}
                                    onChange={handleChange}
                                    disabled={submitting}
                                />
                            </div>

                            <div className="fos-form-group">
                                <label className="fos-label">Pincode</label>
                                <input
                                    type="text"
                                    name="pincode"
                                    className="fos-input"
                                    placeholder="e.g. 110001"
                                    maxLength="6"
                                    value={formData.pincode}
                                    onChange={handleChange}
                                    disabled={submitting}
                                />
                            </div>

                            <div className="fos-form-group">
                                <label className="fos-label">
                                    Consultation Fee (₹)
                                    <span className="fos-hint-text">(Optional)</span>
                                </label>
                                <input
                                    type="number"
                                    name="consultationFee"
                                    className="fos-input"
                                    placeholder="e.g. 500"
                                    min="0"
                                    value={formData.consultationFee}
                                    onChange={handleChange}
                                    disabled={submitting}
                                />
                            </div>
                        </div>
                    </div>

                    {/* SECTION 2: DOCTOR DETAILS */}
                    <div className="fos-section">
                        <div className="fos-section-header">
                            <div className="fos-section-icon-badge">👨‍⚕️</div>
                            <div>
                                <h3 className="fos-section-title">Doctor Practitioner Details</h3>
                                <p className="fos-section-desc">Your clinical credentials and login access</p>
                            </div>
                        </div>

                        <div className="fos-form-grid">
                            <div className="fos-form-group">
                                <label className="fos-label">
                                    Doctor Full Name <span className="req">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="doctorName"
                                    className={`fos-input ${errors.doctorName ? 'error' : ''}`}
                                    placeholder="e.g. Dr. Rajesh Sharma"
                                    value={formData.doctorName}
                                    onChange={handleChange}
                                    disabled={submitting}
                                />
                                {errors.doctorName && <span className="fos-error-text">⚠ {errors.doctorName}</span>}
                            </div>

                            <div className="fos-form-group">
                                <label className="fos-label">
                                    Email Address (Used for Login & OTP) <span className="req">*</span>
                                </label>
                                <input
                                    type="email"
                                    name="doctorEmail"
                                    className={`fos-input ${errors.doctorEmail ? 'error' : ''}`}
                                    placeholder="doctor@example.com"
                                    value={formData.doctorEmail}
                                    onChange={handleChange}
                                    disabled={submitting}
                                />
                                {errors.doctorEmail && <span className="fos-error-text">⚠ {errors.doctorEmail}</span>}
                            </div>

                            <div className="fos-form-group">
                                <label className="fos-label">
                                    Mobile Number (10 digits) <span className="req">*</span>
                                </label>
                                <input
                                    type="tel"
                                    name="doctorPhone"
                                    className={`fos-input ${errors.doctorPhone ? 'error' : ''}`}
                                    placeholder="9876543210"
                                    maxLength="10"
                                    value={formData.doctorPhone}
                                    onChange={handleChange}
                                    disabled={submitting}
                                />
                                {errors.doctorPhone && <span className="fos-error-text">⚠ {errors.doctorPhone}</span>}
                            </div>

                            <div className="fos-form-group">
                                <label className="fos-label">Specialization</label>
                                <select
                                    name="specialization"
                                    className="fos-select"
                                    value={formData.specialization}
                                    onChange={handleChange}
                                    disabled={submitting}
                                >
                                    {SPECIALTIES.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="fos-form-group full-width">
                                <label className="fos-label">Qualification / Degree</label>
                                <input
                                    type="text"
                                    name="qualification"
                                    className="fos-input"
                                    placeholder="e.g. MBBS, MD (Medicine)"
                                    value={formData.qualification}
                                    onChange={handleChange}
                                    disabled={submitting}
                                />
                            </div>

                            <div className="fos-form-group">
                                <label className="fos-label">
                                    Create Password <span className="req">*</span>
                                </label>
                                <input
                                    type="password"
                                    name="password"
                                    className={`fos-input ${errors.password ? 'error' : ''}`}
                                    placeholder="Min 8 characters (letters + numbers)"
                                    value={formData.password}
                                    onChange={handleChange}
                                    disabled={submitting}
                                />
                                {errors.password && <span className="fos-error-text">⚠ {errors.password}</span>}
                            </div>

                            <div className="fos-form-group">
                                <label className="fos-label">
                                    Confirm Password <span className="req">*</span>
                                </label>
                                <input
                                    type="password"
                                    name="confirmPassword"
                                    className={`fos-input ${errors.confirmPassword ? 'error' : ''}`}
                                    placeholder="Re-enter password"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    disabled={submitting}
                                />
                                {errors.confirmPassword && <span className="fos-error-text">⚠ {errors.confirmPassword}</span>}
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="fos-submit-btn"
                        disabled={submitting}
                    >
                        {submitting ? (
                            <>
                                <span className="fos-spinner" />
                                <span>Provisioning Your Free Clinic...</span>
                            </>
                        ) : (
                            <span>Create My Free OPD Clinic 🚀</span>
                        )}
                    </button>

                    <p className="fos-privacy-note">
                        🔒 By submitting, you agree to Medical365's Terms of Service and Privacy Policy. No charges will ever apply to the Free Doctor OPD Plan.
                    </p>
                </form>
            </div>
        </div>
    );
};

export default FreeOpdSignup;
