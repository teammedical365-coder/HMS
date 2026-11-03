import React, { useState, useEffect } from 'react';
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
    useEffect(() => {
        document.title = 'Medical365 - Doctor Onboarding';
    }, []);

    const [formData, setFormData] = useState({
        clinicName: '',
        address: '',
        city: '',
        state: '',
        pincode: '',
        consultationFee: '',
        doctorName: '',
        doctorEmail: '',
        doctorPhone: '',
        specialization: 'General Physician',
        qualification: '',
        password: '',
        confirmPassword: ''
    });

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [apiError, setApiError] = useState('');
    const [signupResult, setSignupResult] = useState(null);
    const [copied, setCopied] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (apiError) setApiError('');
    };

    // Live Password Validation
    const pwd = formData.password;
    const confirmPwd = formData.confirmPassword;
    const isLen = pwd.length >= 8;
    const isUp = /[A-Z]/.test(pwd);
    const isLowNum = /[a-z]/.test(pwd) && /[0-9]/.test(pwd);
    const hasPasswordInput = pwd.length > 0;
    const hasConfirmInput = confirmPwd.length > 0;
    const passwordsMatch = pwd === confirmPwd && hasConfirmInput;

    let pwdStrength = 0;
    if (isLen) pwdStrength++;
    if (isUp) pwdStrength++;
    if (isLowNum) pwdStrength++;

    const isFormValid =
        formData.clinicName.trim().length >= 2 &&
        formData.doctorName.trim().length >= 2 &&
        formData.doctorEmail.trim().length >= 5 &&
        /^\S+@\S+\.\S+$/.test(formData.doctorEmail.trim()) &&
        formData.doctorPhone.replace(/\D/g, '').length === 10 &&
        isLen &&
        isUp &&
        isLowNum &&
        passwordsMatch;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting || !isFormValid) return;

        setApiError('');
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
            console.error('Doctor Onboarding error:', err);
            const msg = err.response?.data?.message || err.message || 'Registration failed. Please check your network and try again.';
            setApiError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleCopyUrl = () => {
        if (!signupResult) return;
        const targetUrl = signupResult.clinicUrl || `https://${signupResult.clinic?.slug}.medical365.in`;
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

    // ─────────────────────────────────────────────────────────────────────────
    // REGISTRATION SUCCESS VIEW
    // ─────────────────────────────────────────────────────────────────────────
    if (signupResult) {
        const { clinic, doctor, clinicUrl } = signupResult;
        const isLocalOrPreview =
            window.location.hostname.includes('localhost') ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.endsWith('.vercel.app');
        
        // Canonical working login URL with pre-filled email
        const effectiveLoginUrl = isLocalOrPreview
            ? `/login?email=${encodeURIComponent(doctor.email)}`
            : `https://medical365.in/login?email=${encodeURIComponent(doctor.email)}`;

        return (
            <div className="fos-onboarding-body px-4 sm:px-6 py-8">
                {/* Minimal Header */}
                <header className="w-full max-w-6xl mx-auto px-6 py-5 flex justify-start items-center z-10 mb-2">
                    <img src="/medical365logo1.webp" alt="Medical365" className="h-8 md:h-10 w-auto object-contain" />
                </header>

                <div className="fos-success-card text-center">
                    <div className="fos-badge-check">✓</div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-brand-blue mb-2">
                        Signup Successful!
                    </h1>
                    <p className="text-slate-600 text-sm sm:text-base font-medium mb-6">
                        Congratulations, <strong>{doctor.name}</strong>! Your autonomous digital clinic workspace has been created.
                    </p>

                    {/* Summary Box */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 text-left space-y-2.5 mb-6 text-sm">
                        <div className="flex justify-between py-1 border-b border-slate-200">
                            <span className="text-slate-500 font-semibold">Clinic Name:</span>
                            <span className="font-bold text-slate-800">{clinic.name}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200">
                            <span className="text-slate-500 font-semibold">Consulting Doctor:</span>
                            <span className="font-bold text-slate-800">{doctor.name} ({doctor.specialty})</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200">
                            <span className="text-slate-500 font-semibold">Registered Email:</span>
                            <span className="font-bold text-slate-800">{doctor.email}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200">
                            <span className="text-slate-500 font-semibold">Subscription Plan:</span>
                            <span className="font-bold text-brand-teal">Doctor OPD (₹0 / Month)</span>
                        </div>
                        <div className="flex justify-between py-1">
                            <span className="text-slate-500 font-semibold">Daily Quota:</span>
                            <span className="font-bold text-slate-800">20 Appointments / Day</span>
                        </div>
                    </div>

                    {/* Clinic Web Address */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 text-left mb-6 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Your Dedicated Clinic Web Address</span>
                            <span className="text-xs font-bold text-emerald-600">SSL Protected</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                className="input-premium flex-1 px-3 py-2 rounded-lg text-xs sm:text-sm font-mono text-slate-800 bg-slate-50"
                                value={clinicUrl}
                                readOnly
                                onClick={(e) => e.target.select()}
                            />
                            <button
                                type="button"
                                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                                    copied ? 'bg-emerald-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                                onClick={handleCopyUrl}
                            >
                                {copied ? '✓ Copied' : 'Copy URL'}
                            </button>
                        </div>
                    </div>

                    {/* Login Guidance */}
                    <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-left mb-6 text-xs sm:text-sm text-sky-900">
                        <div className="font-bold mb-1 flex items-center gap-2">
                            <span>🔑</span>
                            <span>Sign In to Your Workspace</span>
                        </div>
                        <p className="text-sky-800 text-xs leading-relaxed">
                            Click <strong>Login Now</strong> below to sign in using your registered email (<strong>{doctor.email}</strong>) and password. Your dashboard will open automatically.
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <a
                            href={effectiveLoginUrl}
                            className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-extrabold text-white bg-gradient-to-r from-brand-blue to-brand-teal hover:from-blue-800 hover:to-teal-600 transition-all shadow-md text-sm sm:text-base flex items-center justify-center gap-2"
                        >
                            <span>🔐</span>
                            <span>Login Now</span>
                        </a>
                        <a
                            href={clinicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all text-sm flex items-center justify-center gap-2"
                        >
                            <span>🌐</span>
                            <span>Visit Clinic Webpage</span>
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ONBOARDING FORM VIEW
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="fos-onboarding-body text-slate-800 antialiased min-h-screen flex flex-col items-center pb-16">
            {/* Minimal Header */}
            <header className="w-full max-w-6xl mx-auto px-6 py-5 flex justify-start items-center z-10 mb-2">
                <img src="/medical365logo1.webp" alt="Medical365" className="h-8 md:h-10 w-auto object-contain" />
            </header>

            {/* Main Onboarding Container */}
            <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center z-10">
                {/* Compact Hero Section */}
                <div className="text-center mb-[28px] max-w-2xl">
                    <h1 className="text-[28px] md:text-[36px] font-extrabold text-brand-blue mb-2.5 tracking-tight leading-tight">
                        Start Your Digital Practice
                    </h1>
                    <p className="text-slate-500 text-[14px] md:text-[15px] leading-relaxed font-medium">
                        Everything you need to manage your clinic, patients and daily practice — all in one place.
                    </p>
                </div>

                {/* Compact Feature Strip with Borders */}
                <div className="w-full max-w-5xl bg-white rounded-xl border border-slate-200 shadow-sm p-1.5 mb-8">
                    <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                        {/* Feature 1 */}
                        <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-2.5 p-3 text-center sm:text-left">
                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                            </div>
                            <div>
                                <h4 className="text-[13px] font-bold text-slate-800 leading-tight">1 Solo Doctor</h4>
                                <p className="text-[11px] text-slate-500 font-medium mt-0.5">Autonomous OPD practice</p>
                            </div>
                        </div>

                        {/* Feature 2 */}
                        <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-2.5 p-3 text-center sm:text-left">
                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            </div>
                            <div>
                                <h4 className="text-[13px] font-bold text-slate-800 leading-tight">20 Appts / Day</h4>
                                <p className="text-[11px] text-slate-500 font-medium mt-0.5">Daily renewal quota</p>
                            </div>
                        </div>

                        {/* Feature 3 */}
                        <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-2.5 p-3 text-center sm:text-left">
                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            </div>
                            <div>
                                <h4 className="text-[13px] font-bold text-slate-800 leading-tight">Unlimited Records</h4>
                                <p className="text-[11px] text-slate-500 font-medium mt-0.5">Full history & prescriptions</p>
                            </div>
                        </div>

                        {/* Feature 4 */}
                        <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-2.5 p-3 text-center sm:text-left">
                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-teal-50 border border-brand-teal/30 flex items-center justify-center text-brand-teal">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                            </div>
                            <div>
                                <h4 className="text-[13px] font-bold text-brand-teal leading-tight">₹0 / Month</h4>
                                <p className="text-[11px] text-brand-teal/80 font-semibold mt-0.5">No credit card required</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2-Column Registration Form with Borders */}
                <form
                    id="onboardingForm"
                    onSubmit={handleSubmit}
                    className="w-full bg-white rounded-[1.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 p-6 sm:p-10 lg:p-12 relative"
                >
                    {apiError && (
                        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex items-center gap-2">
                            <span>⚠</span>
                            <span>{apiError}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14">
                        {/* COLUMN 1: Clinic Information */}
                        <div className="flex flex-col space-y-5">
                            <div className="pb-3 border-b border-slate-200">
                                <h2 className="text-[17px] font-extrabold text-brand-blue">Clinic Information</h2>
                                <p className="text-[13px] text-slate-500 font-medium mt-1">Tell us about your medical practice.</p>
                            </div>

                            {/* Clinic Name */}
                            <div>
                                <label className="block text-[13px] font-bold text-slate-800 mb-1.5">
                                    Clinic Name <span className="text-brand-teal">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="clinicName"
                                    required
                                    placeholder="e.g. LifeCare OPD & PolyClinic"
                                    value={formData.clinicName}
                                    onChange={handleChange}
                                    className="input-premium w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none"
                                />
                            </div>

                            {/* Address */}
                            <div>
                                <label className="block text-[13px] font-bold text-slate-800 mb-1.5">Complete Address</label>
                                <input
                                    type="text"
                                    name="address"
                                    placeholder="e.g. Shop 4, Ground Floor, Central Market"
                                    value={formData.address}
                                    onChange={handleChange}
                                    className="input-premium w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none"
                                />
                            </div>

                            {/* City & State */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-800 mb-1.5">City</label>
                                    <input
                                        type="text"
                                        name="city"
                                        placeholder="e.g. New Delhi"
                                        value={formData.city}
                                        onChange={handleChange}
                                        className="input-premium w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-800 mb-1.5">State</label>
                                    <input
                                        type="text"
                                        name="state"
                                        placeholder="e.g. Delhi"
                                        value={formData.state}
                                        onChange={handleChange}
                                        className="input-premium w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Pincode & Fee */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-800 mb-1.5">Pincode</label>
                                    <input
                                        type="text"
                                        name="pincode"
                                        placeholder="e.g. 110001"
                                        value={formData.pincode}
                                        onChange={handleChange}
                                        className="input-premium w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-800 mb-1.5">
                                        Consultation Fee <span className="text-slate-400 font-semibold">(Optional)</span>
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 text-sm font-bold">₹</div>
                                        <input
                                            type="number"
                                            name="consultationFee"
                                            placeholder="500"
                                            value={formData.consultationFee}
                                            onChange={handleChange}
                                            className="input-premium w-full pl-7 pr-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* COLUMN 2: Doctor Information */}
                        <div className="flex flex-col space-y-5">
                            <div className="pb-3 border-b border-slate-200">
                                <h2 className="text-[17px] font-extrabold text-brand-blue">Doctor Information</h2>
                                <p className="text-[13px] text-slate-500 font-medium mt-1">Set up your professional profile and account access.</p>
                            </div>

                            {/* Full Name */}
                            <div>
                                <label className="block text-[13px] font-bold text-slate-800 mb-1.5">
                                    Doctor Full Name <span className="text-brand-teal">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="doctorName"
                                    required
                                    placeholder="e.g. Dr. Rajesh Sharma"
                                    value={formData.doctorName}
                                    onChange={handleChange}
                                    className="input-premium w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none"
                                />
                            </div>

                            {/* Email & Mobile */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-800 mb-1.5">
                                        Email Address <span className="text-brand-teal">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        name="doctorEmail"
                                        required
                                        placeholder="doctor@example.com"
                                        value={formData.doctorEmail}
                                        onChange={handleChange}
                                        className="input-premium w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-800 mb-1.5">
                                        Mobile Number <span className="text-brand-teal">*</span>
                                    </label>
                                    <input
                                        type="tel"
                                        name="doctorPhone"
                                        required
                                        pattern="[0-9]{10}"
                                        maxLength="10"
                                        placeholder="9876543210"
                                        value={formData.doctorPhone}
                                        onChange={handleChange}
                                        className="input-premium w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Specialization & Qualification */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-800 mb-1.5">Specialization</label>
                                    <select
                                        name="specialization"
                                        value={formData.specialization}
                                        onChange={handleChange}
                                        className="fos-select input-premium w-full pl-3.5 pr-8 py-2.5 rounded-lg text-sm text-slate-900 outline-none cursor-pointer"
                                    >
                                        {SPECIALTIES.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-800 mb-1.5">Qualification / Degree</label>
                                    <input
                                        type="text"
                                        name="qualification"
                                        placeholder="e.g. MBBS, MD"
                                        value={formData.qualification}
                                        onChange={handleChange}
                                        className="input-premium w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Passwords */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Create Password */}
                                <div className="flex flex-col">
                                    <label className="block text-[13px] font-bold text-slate-800 mb-1.5">
                                        Create Password <span className="text-brand-teal">*</span>
                                    </label>
                                    <div className="relative mb-2">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            name="password"
                                            required
                                            placeholder="Min 8 characters"
                                            value={formData.password}
                                            onChange={handleChange}
                                            className="input-premium w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none pr-10"
                                        />
                                        <button
                                            type="button"
                                            tabIndex={-1}
                                            onClick={() => setShowPassword(p => !p)}
                                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-brand-blue transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                        </button>
                                    </div>

                                    {/* Live Password Requirements & Strength */}
                                    <div className="text-[12px] space-y-1.5 mt-0.5">
                                        <div className="flex gap-1 h-1 rounded-full overflow-hidden mb-1.5 max-w-[180px] bg-slate-100 border border-slate-200">
                                            <div className={`h-full w-1/3 transition-colors duration-300 ${!hasPasswordInput ? 'bg-transparent' : pwdStrength >= 1 ? (pwdStrength === 1 ? 'bg-red-500' : pwdStrength === 2 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-transparent'}`}></div>
                                            <div className={`h-full w-1/3 transition-colors duration-300 ${!hasPasswordInput ? 'bg-transparent' : pwdStrength >= 2 ? (pwdStrength === 2 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-transparent'}`}></div>
                                            <div className={`h-full w-1/3 transition-colors duration-300 ${!hasPasswordInput ? 'bg-transparent' : pwdStrength === 3 ? 'bg-emerald-500' : 'bg-transparent'}`}></div>
                                        </div>

                                        {hasPasswordInput && (
                                            <div className={`text-[11px] font-bold mb-1 ${pwdStrength <= 1 ? 'text-red-600' : pwdStrength === 2 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                {pwdStrength <= 1 ? 'Weak' : pwdStrength === 2 ? 'Fair' : 'Strong'}
                                            </div>
                                        )}

                                        <ul className="space-y-1 text-slate-500 font-medium">
                                            <li className={`flex items-center gap-1.5 transition-colors duration-200 ${!hasPasswordInput ? 'text-slate-500' : isLen ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}`}>
                                                <span className="flex-shrink-0">
                                                    {!hasPasswordInput ? (
                                                        <svg className="w-3 h-3 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>
                                                    ) : isLen ? (
                                                        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                                    ) : (
                                                        <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                                                    )}
                                                </span>
                                                <span>8+ characters (12+ rec.)</span>
                                            </li>

                                            <li className={`flex items-center gap-1.5 transition-colors duration-200 ${!hasPasswordInput ? 'text-slate-500' : isUp ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}`}>
                                                <span className="flex-shrink-0">
                                                    {!hasPasswordInput ? (
                                                        <svg className="w-3 h-3 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>
                                                    ) : isUp ? (
                                                        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                                    ) : (
                                                        <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                                                    )}
                                                </span>
                                                <span>Uppercase letter</span>
                                            </li>

                                            <li className={`flex items-center gap-1.5 transition-colors duration-200 ${!hasPasswordInput ? 'text-slate-500' : isLowNum ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}`}>
                                                <span className="flex-shrink-0">
                                                    {!hasPasswordInput ? (
                                                        <svg className="w-3 h-3 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>
                                                    ) : isLowNum ? (
                                                        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                                    ) : (
                                                        <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                                                    )}
                                                </span>
                                                <span>Lowercase letter + number</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>

                                {/* Confirm Password */}
                                <div className="flex flex-col">
                                    <label className="block text-[13px] font-bold text-slate-800 mb-1.5">
                                        Confirm Password <span className="text-brand-teal">*</span>
                                    </label>
                                    <div className="relative mb-2">
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            name="confirmPassword"
                                            required
                                            placeholder="Re-enter password"
                                            value={formData.confirmPassword}
                                            onChange={handleChange}
                                            className="input-premium w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none pr-10"
                                        />
                                        <button
                                            type="button"
                                            tabIndex={-1}
                                            onClick={() => setShowConfirmPassword(p => !p)}
                                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-brand-blue transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                        </button>
                                    </div>

                                    {hasConfirmInput && (
                                        <div className="text-[12px] font-bold mt-0.5 h-4">
                                            {passwordsMatch ? (
                                                <span className="flex items-center gap-1 text-emerald-600">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                                    Passwords match
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-red-600">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                                                    Passwords do not match
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Submit Section */}
                    <div className="mt-10 pt-8 border-t border-slate-200 flex flex-col items-center">
                        <button
                            type="submit"
                            id="submitBtn"
                            disabled={!isFormValid || submitting}
                            className="group relative w-full sm:w-80 disabled:opacity-60 disabled:cursor-not-allowed bg-gradient-to-r from-brand-blue to-brand-teal hover:from-blue-800 hover:to-teal-600 text-white text-[15px] font-bold py-3.5 px-6 rounded-lg transition-all duration-300 shadow-md flex justify-center items-center gap-2 overflow-hidden cursor-pointer"
                        >
                            {submitting ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span>Creating Account...</span>
                                </span>
                            ) : (
                                <span>Create My Clinic Account</span>
                            )}
                        </button>

                        <p className="text-center text-[12px] text-slate-500 font-medium mt-5 max-w-lg leading-relaxed">
                            🔒 Your information is protected. By continuing, you agree to our Terms of Service and Privacy Policy. No charges will ever apply to the Free Doctor OPD Plan.
                        </p>
                    </div>
                </form>
            </main>
        </div>
    );
};

export default FreeOpdSignup;
