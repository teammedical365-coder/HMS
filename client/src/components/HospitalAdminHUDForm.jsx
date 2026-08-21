import React, { useEffect, useRef, useState } from 'react';
import './HospitalAdminHUDForm.css';

const HospitalAdminHUDForm = ({
    hospitalAdminForm,
    setHospitalAdminForm,
    handleCreateHospitalAdmin,
    creatingHospitalAdmin,
    hospitals = []
}) => {
    const fileInputRef = useRef(null);
    const canvasOverlayRef = useRef(null);
    const [selectedFileName, setSelectedFileName] = useState(hospitalAdminForm?.file?.name || '');
    const [latency, setLatency] = useState(12);

    // Live Telemetry Cycling
    useEffect(() => {
        const interval = setInterval(() => {
            setLatency(Math.floor(10 + Math.random() * 5));
        }, 2800);
        return () => clearInterval(interval);
    }, []);

    // Interactive Cyber Hologram Canvas over the Smart Hospital Image
    useEffect(() => {
        const canvas = canvasOverlayRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animationFrameId;

        const resize = () => {
            if (canvas && canvas.parentElement) {
                canvas.width = canvas.parentElement.clientWidth;
                canvas.height = canvas.parentElement.clientHeight;
            }
        };
        resize();
        window.addEventListener('resize', resize);

        // Smart Targets on the Hospital Image
        const targets = [
            { x: 0.50, y: 0.18, label: 'COMMAND BRIDGE', color: '#00f0ff', r: 7, pulse: 0 },
            { x: 0.20, y: 0.58, label: 'SMART ICU A1', color: '#10b981', r: 6, pulse: 1 },
            { x: 0.78, y: 0.56, label: 'SURGICAL SUITE', color: '#00c7d4', r: 6, pulse: 2 },
            { x: 0.36, y: 0.72, label: 'ROBOTIC PHARMACY', color: '#38bdf8', r: 5, pulse: 3 },
            { x: 0.65, y: 0.74, label: 'PACS CLOUD NODE', color: '#10b981', r: 5, pulse: 4 }
        ];

        const links = [
            [0, 1], [0, 2], [1, 3], [2, 4], [3, 4]
        ];

        const particles = [
            { link: 0, prog: 0, speed: 0.012 },
            { link: 1, prog: 0.5, speed: 0.010 },
            { link: 2, prog: 0.2, speed: 0.014 },
            { link: 3, prog: 0.7, speed: 0.011 }
        ];

        let tick = 0;

        const draw = () => {
            if (!canvas) return;
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            // 1. Draw Connecting Laser Vectors
            links.forEach(([i, j]) => {
                const t1 = targets[i];
                const t2 = targets[j];
                ctx.strokeStyle = 'rgba(0, 229, 255, 0.38)';
                ctx.lineWidth = 1.6;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(t1.x * w, t1.y * h);
                ctx.lineTo(t2.x * w, t2.y * h);
                ctx.stroke();
                ctx.setLineDash([]);
            });

            // 2. Draw Moving Cyber Photons
            particles.forEach(p => {
                const [i, j] = links[p.link];
                const t1 = targets[i];
                const t2 = targets[j];
                const px = t1.x * w + (t2.x * w - t1.x * w) * p.prog;
                const py = t1.y * h + (t2.y * h - t1.y * h) * p.prog;

                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#00f0ff';
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(px, py, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;

                p.prog += p.speed;
                if (p.prog >= 1) p.prog = 0;
            });

            // 3. Draw Pulsing Hologram Reticles
            targets.forEach((t) => {
                const tx = t.x * w;
                const ty = t.y * h;
                const pulseR = t.r + Math.sin(tick * 0.05 + t.pulse) * 5 + 5;

                // Outer Ripple Ring
                ctx.strokeStyle = t.color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(tx, ty, pulseR, 0, Math.PI * 2);
                ctx.stroke();

                // Core Dot
                ctx.fillStyle = t.color;
                ctx.shadowColor = t.color;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(tx, ty, t.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;

                // Center White Nucleus
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(tx, ty, t.r * 0.45, 0, Math.PI * 2);
                ctx.fill();
            });

            tick++;
            animationFrameId = requestAnimationFrame(draw);
        };
        draw();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFileName(file.name);
            setHospitalAdminForm(prev => ({ ...prev, file }));
        }
    };

    const sortedHospitals = [...hospitals].sort((a, b) =>
        (a.name || '').trim().toLowerCase().localeCompare((b.name || '').trim().toLowerCase())
    );

    return (
        <div className="had-unified-container">
            {/* SINGLE MERGED UNIFIED CARD */}
            <div className="had-unified-card">
                {/* LEFT SIDE: WIDE EXPANDED FORM */}
                <div className="had-form-column">
                    <div className="had-card-header">
                        <div className="had-icon-box">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0099a8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                        </div>
                        <div className="had-title-col">
                            <h2>
                                Create Hospital Admin Account
                                <span className="had-badge">
                                    <span className="had-badge-dot"></span> ADMIN ACCESS
                                </span>
                            </h2>
                            <p>This administrator will login at <strong>/login</strong> and manage all hospital operations.</p>
                        </div>
                    </div>

                    <form onSubmit={handleCreateHospitalAdmin} className="had-form">
                        <div className="had-form-grid">
                            {/* FULL NAME */}
                            <div className="had-field-group">
                                <label className="had-label">FULL NAME <span className="had-req">*</span></label>
                                <div className="had-input-box">
                                    <svg className="had-f-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                        <circle cx="12" cy="7" r="4"></circle>
                                    </svg>
                                    <input
                                        type="text"
                                        className="had-input"
                                        placeholder="e.g. Dr. Ramesh Kumar"
                                        value={hospitalAdminForm.name}
                                        onChange={e => setHospitalAdminForm({ ...hospitalAdminForm, name: e.target.value })}
                                        required
                                        minLength={2}
                                    />
                                </div>
                            </div>

                            {/* EMAIL */}
                            <div className="had-field-group">
                                <label className="had-label">EMAIL <span className="had-req">*</span></label>
                                <div className="had-input-box">
                                    <svg className="had-f-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                        <polyline points="22,6 12,13 2,6"></polyline>
                                    </svg>
                                    <input
                                        type="email"
                                        className="had-input"
                                        placeholder="admin@hospital.com"
                                        value={hospitalAdminForm.email}
                                        onChange={e => setHospitalAdminForm({ ...hospitalAdminForm, email: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            {/* PASSWORD */}
                            <div className="had-field-group">
                                <label className="had-label">PASSWORD <span className="had-req">*</span></label>
                                <div className="had-input-box">
                                    <svg className="had-f-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                    </svg>
                                    <input
                                        type="text"
                                        className="had-input"
                                        placeholder="Temporary password"
                                        value={hospitalAdminForm.password}
                                        onChange={e => setHospitalAdminForm({ ...hospitalAdminForm, password: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            {/* PHONE */}
                            <div className="had-field-group">
                                <label className="had-label">PHONE <span className="had-req">*</span></label>
                                <div className="had-input-box">
                                    <svg className="had-f-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                    </svg>
                                    <input
                                        type="tel"
                                        className="had-input"
                                        placeholder="10-digit phone number"
                                        maxLength={10}
                                        value={hospitalAdminForm.phone}
                                        onChange={e => {
                                            const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 10);
                                            setHospitalAdminForm({ ...hospitalAdminForm, phone: cleanVal });
                                        }}
                                        required
                                        pattern="\d{10}"
                                        title="Phone number must be exactly 10 digits"
                                    />
                                </div>
                            </div>

                            {/* AGE */}
                            <div className="had-field-group">
                                <label className="had-label">AGE <span className="had-req">*</span></label>
                                <div className="had-input-box">
                                    <svg className="had-f-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 6 12 12 16 14"></polyline>
                                    </svg>
                                    <input
                                        type="number"
                                        className="had-input"
                                        placeholder="Age"
                                        min="20"
                                        max="100"
                                        value={hospitalAdminForm.age || ''}
                                        onChange={e => {
                                            const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 3);
                                            setHospitalAdminForm({ ...hospitalAdminForm, age: cleanVal });
                                        }}
                                        required
                                    />
                                </div>
                            </div>

                            {/* AADHAAR NUMBER */}
                            <div className="had-field-group">
                                <label className="had-label">AADHAAR NUMBER <span className="had-req">*</span></label>
                                <div className="had-input-box">
                                    <svg className="had-f-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                                        <line x1="2" y1="10" x2="22" y2="10"></line>
                                    </svg>
                                    <input
                                        type="text"
                                        className="had-input"
                                        placeholder="12-digit Aadhaar"
                                        maxLength={12}
                                        value={hospitalAdminForm.aadhaarNumber || ''}
                                        onChange={e => {
                                            const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 12);
                                            setHospitalAdminForm({ ...hospitalAdminForm, aadhaarNumber: cleanVal });
                                        }}
                                        required
                                        pattern="^\d{12}$"
                                        title="Aadhaar number must be exactly 12 digits"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* BOTTOM ROW: PROFILE PHOTO & ASSIGN HOSPITAL */}
                        <div className="had-bottom-grid">
                            {/* PROFILE PHOTO SCANNER */}
                            <div className="had-field-group">
                                <label className="had-label">PROFILE PHOTO</label>
                                <div className="had-photo-picker" onClick={() => fileInputRef.current?.click()}>
                                    <div className="had-photo-laser"></div>
                                    <div className="had-photo-shutter">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                            <circle cx="12" cy="13" r="4"></circle>
                                        </svg>
                                    </div>
                                    <div className="had-photo-meta">
                                        <strong>{selectedFileName || 'Scan / Upload Photo'}</strong>
                                        <span>{selectedFileName ? 'Photo attached' : 'Click to select image file'}</span>
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={handleFileChange}
                                    />
                                </div>
                            </div>

                            {/* ASSIGN HOSPITAL */}
                            <div className="had-field-group">
                                <label className="had-label">ASSIGN HOSPITAL <span className="had-req">*</span></label>
                                <div className="had-input-box">
                                    <svg className="had-f-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M3 21h18M5 21V7l8-4v18M13 11h4M13 15h4M13 19h4M9 9v.01M9 13v.01M9 17v.01"></path>
                                    </svg>
                                    <select
                                        className="had-select"
                                        value={hospitalAdminForm.hospitalId || ''}
                                        onChange={e => setHospitalAdminForm({ ...hospitalAdminForm, hospitalId: e.target.value })}
                                        required
                                    >
                                        <option value="" disabled>-- Select Hospital --</option>
                                        {sortedHospitals.map(h => (
                                            <option key={h._id} value={h._id}>
                                                {h.name}{h.city ? ` — ${h.city}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* HIGH ENERGY SUBMIT BUTTON */}
                        <button type="submit" disabled={creatingHospitalAdmin} className="had-submit-btn">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            {creatingHospitalAdmin ? 'Provisioning Hospital Admin Node...' : 'Create Hospital Admin'}
                        </button>
                    </form>
                </div>

                {/* RIGHT SIDE: SEAMLESS HERO ANIMATED COMMAND DECK (ALIGNED TO TOP) */}
                <div className="had-visual-column">
                    {/* BIG HERO ANIMATED IMAGE */}
                    <div className="had-hub-image-container">
                        <img
                            src="/assets/smart-hospital-hub.jpg"
                            alt="Smart Hospital Command Center"
                            className="had-hub-img"
                        />

                        {/* Interactive Cyber Canvas Vector Layer */}
                        <canvas ref={canvasOverlayRef} className="had-hub-canvas-overlay"></canvas>

                        {/* Holographic Laser Scanline */}
                        <div className="had-hub-scanline"></div>

                        {/* Glowing Radar Sweep Beam */}
                        <div className="had-radar-sweep"></div>

                        {/* Floating Status Tag Badges */}
                        <div className="had-hub-badge badge-top">
                            <span className="hbadge-dot"></span>
                            COMMAND DECK • ONLINE
                        </div>
                        <div className="had-hub-badge badge-bottom">
                            <span className="hbadge-dot pulse-emerald"></span>
                            AI CORE • {latency}ms
                        </div>
                    </div>

                    {/* CONCISE 3 BULLET POINTS */}
                    <div className="had-minimal-points">
                        <div className="had-m-point">
                            <span className="had-m-icon">✓</span>
                            <span>Manage OPD, IPD, Beds, Appointments & Doctors</span>
                        </div>
                        <div className="had-m-point">
                            <span className="had-m-icon">✓</span>
                            <span>Access Pharmacy, Labs, Billing & Receptionists</span>
                        </div>
                        <div className="had-m-point">
                            <span className="had-m-icon">✓</span>
                            <span>White-Label Domain & Custom Branding Controls</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HospitalAdminHUDForm;
