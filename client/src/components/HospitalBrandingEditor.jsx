import React, { useState, useEffect, useCallback } from 'react';
import { hospitalAPI } from '../utils/api';
import { useBranding } from '../context/BrandingContext';
import './HospitalBrandingEditor.css';

/* ── Color swatch picker ─────────────────────────────────── */
const ColorField = ({ label, name, value, onChange }) => (
    <div className="hbe-color-field">
        <label className="hbe-field-label">{label}</label>
        <div className="hbe-color-row">
            <input
                type="color"
                value={value || '#14b8a6'}
                onChange={e => onChange(name, e.target.value)}
                className="hbe-color-swatch"
                title={label}
            />
            <input
                type="text"
                value={value || ''}
                onChange={e => onChange(name, e.target.value)}
                placeholder="#hex"
                className="hbe-hex-input"
                maxLength={7}
            />
        </div>
    </div>
);

/* ── Text field ──────────────────────────────────────────── */
const TextField = ({ label, name, value, onChange, placeholder, type = 'text', hint }) => (
    <div className="hbe-field">
        <label className="hbe-field-label">{label}</label>
        {hint && <span className="hbe-field-hint">{hint}</span>}
        <input
            type={type}
            value={value || ''}
            onChange={e => onChange(name, e.target.value)}
            placeholder={placeholder}
            className="hbe-input"
        />
    </div>
);

/* ── Main Component ──────────────────────────────────────── */
const HospitalBrandingEditor = ({ hospital, onClose }) => {
    const { loadBranding } = useBranding();

    const [tab, setTab] = useState('identity');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [previewing, setPreviewing] = useState(false);

    const [form, setForm] = useState({
        appName: '', tagline: '', logoUrl: '', faviconUrl: '',
        primaryColor: '#14b8a6', secondaryColor: '#0a2647', accentColor: '#6366f1',
        successColor: '#10b981', backgroundColor: '#f8fafc', textColor: '#1e293b',
        supportEmail: '', supportPhone: '', address: '',
        websiteUrl: '', instagramUrl: '', facebookUrl: '', twitterUrl: '',
        footerText: '',
    });

    // Load existing branding on mount
    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            try {
                const res = await hospitalAPI.getBranding(hospital._id);
                if (res.success && res.branding) {
                    setForm(prev => ({ ...prev, ...res.branding }));
                }
            } catch (e) { /* branding may not exist yet */ }
            finally { setLoading(false); }
        };
        fetch();
    }, [hospital._id]);

    const handleChange = useCallback((name, value) => {
        setForm(prev => ({ ...prev, [name]: value }));
    }, []);

    const handleSave = async () => {
        setSaving(true); setError(''); setSuccess('');
        try {
            const res = await hospitalAPI.updateBranding(hospital._id, form);
            if (res.success) {
                setSuccess('✅ Branding saved successfully!');
                // Optionally apply the preview
                if (previewing) {
                    await loadBranding(hospital._id);
                }
                setTimeout(() => setSuccess(''), 4000);
            }
        } catch (err) {
            setError(err?.response?.data?.message || 'Failed to save branding.');
        } finally { setSaving(false); }
    };

    const handlePreview = async () => {
        // Save then apply to current browser session
        setSaving(true);
        try {
            const res = await hospitalAPI.updateBranding(hospital._id, form);
            if (res.success) {
                await loadBranding(hospital._id);
                setPreviewing(true);
                setSuccess('🎨 Preview applied! The app now shows this hospital\'s theme.');
                setTimeout(() => setSuccess(''), 5000);
            }
        } catch (e) { setError('Preview failed.'); }
        finally { setSaving(false); }
    };

    const handleReset = () => {
        setForm({
            appName: hospital.name || '', tagline: '',
            logoUrl: hospital.logo || '', faviconUrl: '',
            primaryColor: '#14b8a6', secondaryColor: '#0a2647', accentColor: '#6366f1',
            successColor: '#10b981', backgroundColor: '#f8fafc', textColor: '#1e293b',
            supportEmail: hospital.email || '', supportPhone: hospital.phone || '',
            address: hospital.address || '', websiteUrl: hospital.website || '',
            instagramUrl: '', facebookUrl: '', twitterUrl: '',
            footerText: `© ${new Date().getFullYear()} ${hospital.name}. All rights reserved.`,
        });
    };

    const tabs = [
        { id: 'identity', label: '🏷️ Identity', icon: '🏥' },
        { id: 'colors', label: '🎨 Colors', icon: '🖌️' },
        { id: 'contact', label: '📞 Contact', icon: '📋' },
        { id: 'social', label: '🌐 Social', icon: '🔗' },
    ];

    return (
        <div className="hbe-overlay" onClick={e => e.target.classList.contains('hbe-overlay') && onClose()}>
            <div className="hbe-modal">

                {/* ── Header ── */}
                <div className="hbe-header">
                    <div className="hbe-header-info">
                        <div className="hbe-header-badge">WHITE LABEL</div>
                        <h2 className="hbe-title">Branding Studio</h2>
                        <p className="hbe-subtitle">
                            Configuring: <strong>{hospital.name}</strong>
                            {hospital.city && ` · ${hospital.city}`}
                        </p>
                    </div>
                    <button className="hbe-close-btn" onClick={onClose}>✕</button>
                </div>

                {/* ── Preview Banner ── */}
                {previewing && (
                    <div className="hbe-preview-banner">
                        🎨 You're previewing <strong>{hospital.name}</strong>'s theme
                    </div>
                )}

                {/* ── Status Messages ── */}
                {error   && <div className="hbe-error">{error}</div>}
                {success && <div className="hbe-success">{success}</div>}

                {/* ── Tabs ── */}
                <div className="hbe-tabs">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            className={`hbe-tab ${tab === t.id ? 'hbe-tab-active' : ''}`}
                            onClick={() => setTab(t.id)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="hbe-loading">⏳ Loading current branding…</div>
                ) : (
                    <div className="hbe-body">

                        {/* ── IDENTITY TAB ── */}
                        {tab === 'identity' && (
                            <div className="hbe-section">
                                <div className="hbe-section-title">🏥 Identity & App Name</div>
                                <div className="hbe-grid-2">
                                    <TextField label="App / Suite Name" name="appName" value={form.appName} onChange={handleChange} placeholder={`${hospital.name} HMS`} hint="Shows in navbar and browser tab" />
                                    <TextField label="Tagline" name="tagline" value={form.tagline} onChange={handleChange} placeholder="Caring for every life" hint="Shows below the logo" />
                                </div>
                                <div className="hbe-grid-2">
                                    <TextField label="Logo URL" name="logoUrl" value={form.logoUrl} onChange={handleChange} placeholder="https://cdn.hospital.com/logo.png" hint="Direct image URL (PNG, SVG preferred)" />
                                    <TextField label="Favicon URL" name="faviconUrl" value={form.faviconUrl} onChange={handleChange} placeholder="https://cdn.hospital.com/favicon.ico" hint="Browser tab icon" />
                                </div>

                                {/* Logo preview */}
                                {form.logoUrl && (
                                    <div className="hbe-logo-preview">
                                        <span className="hbe-preview-label">Logo Preview</span>
                                        <div className="hbe-logo-box">
                                            <img
                                                src={form.logoUrl}
                                                alt="Logo preview"
                                                onError={e => { e.target.style.display = 'none'; }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="hbe-section-title" style={{ marginTop: 24 }}>🪪 Footer Text</div>
                                <TextField label="Footer Copyright Text" name="footerText" value={form.footerText} onChange={handleChange} placeholder={`© ${new Date().getFullYear()} ${hospital.name}. All rights reserved.`} />
                            </div>
                        )}

                        {/* ── COLORS TAB ── */}
                        {tab === 'colors' && (
                            <div className="hbe-section">
                                <div className="hbe-section-title">🎨 Color Theme</div>
                                <p className="hbe-section-desc">
                                    These colors control the entire app's appearance for this hospital's staff — buttons, gradients, nav, cards, and highlights.
                                </p>

                                {/* Live theme preview */}
                                <div className="hbe-color-preview-card" style={{ '--p': form.primaryColor, '--s': form.secondaryColor, '--a': form.accentColor }}>
                                    <div className="hbe-cp-header" style={{ background: `linear-gradient(135deg, ${form.primaryColor}, ${form.secondaryColor})` }}>
                                        <span className="hbe-cp-brand">{form.appName || hospital.name}</span>
                                        <div className="hbe-cp-dots">
                                            <span style={{ background: 'rgba(255,255,255,0.5)' }}></span>
                                            <span style={{ background: 'rgba(255,255,255,0.5)' }}></span>
                                            <span style={{ background: 'rgba(255,255,255,0.5)' }}></span>
                                        </div>
                                    </div>
                                    <div className="hbe-cp-body" style={{ background: form.backgroundColor }}>
                                        <div className="hbe-cp-card">
                                            <div className="hbe-cp-stat" style={{ color: form.primaryColor }}>128</div>
                                            <div style={{ fontSize: 11, color: form.textColor, opacity: 0.6 }}>Patients</div>
                                        </div>
                                        <div className="hbe-cp-btns">
                                            <div className="hbe-cp-btn-primary" style={{ background: `linear-gradient(135deg, ${form.primaryColor}, ${form.secondaryColor})` }}>Book Appointment</div>
                                            <div className="hbe-cp-btn-outline" style={{ border: `1.5px solid ${form.primaryColor}`, color: form.primaryColor }}>View Records</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="hbe-color-grid">
                                    <ColorField label="Primary Color" name="primaryColor" value={form.primaryColor} onChange={handleChange} />
                                    <ColorField label="Secondary / Dark" name="secondaryColor" value={form.secondaryColor} onChange={handleChange} />
                                    <ColorField label="Accent" name="accentColor" value={form.accentColor} onChange={handleChange} />
                                    <ColorField label="Success" name="successColor" value={form.successColor} onChange={handleChange} />
                                    <ColorField label="Background" name="backgroundColor" value={form.backgroundColor} onChange={handleChange} />
                                    <ColorField label="Text Color" name="textColor" value={form.textColor} onChange={handleChange} />
                                </div>

                                {/* Preset themes */}
                                <div className="hbe-section-title" style={{ marginTop: 24 }}>⚡ Quick Presets</div>
                                <div className="hbe-presets">
                                    {[
                                        { name: 'Ocean Teal (Default)', p: '#14b8a6', s: '#0a2647', a: '#6366f1', bg: '#f8fafc', t: '#1e293b' },
                                        { name: 'Crimson Medical', p: '#e11d48', s: '#1e1b4b', a: '#7c3aed', bg: '#fff1f2', t: '#1e293b' },
                                        { name: 'Forest Green', p: '#16a34a', s: '#14532d', a: '#0ea5e9', bg: '#f0fdf4', t: '#1e293b' },
                                        { name: 'Royal Purple', p: '#7c3aed', s: '#1e1b4b', a: '#e11d48', bg: '#faf5ff', t: '#1e293b' },
                                        { name: 'Sunrise Orange', p: '#ea580c', s: '#092032', a: '#eab308', bg: '#fff7ed', t: '#1e293b' },
                                        { name: 'Sky Blue', p: '#0284c7', s: '#0c4a6e', a: '#10b981', bg: '#f0f9ff', t: '#1e293b' },
                                    ].map(preset => (
                                        <button
                                            key={preset.name}
                                            className="hbe-preset-btn"
                                            style={{ '--pc': preset.p, '--sc': preset.s }}
                                            onClick={() => setForm(prev => ({ ...prev, primaryColor: preset.p, secondaryColor: preset.s, accentColor: preset.a, backgroundColor: preset.bg, textColor: preset.t }))}
                                        >
                                            <span className="hbe-preset-swatches">
                                                <span style={{ background: preset.p }}></span>
                                                <span style={{ background: preset.s }}></span>
                                                <span style={{ background: preset.a }}></span>
                                            </span>
                                            <span className="hbe-preset-name">{preset.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── CONTACT TAB ── */}
                        {tab === 'contact' && (
                            <div className="hbe-section">
                                <div className="hbe-section-title">📞 Contact Information</div>
                                <p className="hbe-section-desc">Shown throughout the app — on login pages, receipts, and patient portals.</p>
                                <div className="hbe-grid-2">
                                    <TextField label="Support Email" name="supportEmail" value={form.supportEmail} onChange={handleChange} placeholder="support@hospital.com" type="email" />
                                    <TextField label="Support Phone" name="supportPhone" value={form.supportPhone} onChange={handleChange} placeholder="+91 98765 43210" />
                                </div>
                                <TextField label="Full Address" name="address" value={form.address} onChange={handleChange} placeholder="123, Main Street, Mumbai, Maharashtra 400001" />
                                <TextField label="Hospital Website" name="websiteUrl" value={form.websiteUrl} onChange={handleChange} placeholder="https://www.hospital.com" type="url" />
                            </div>
                        )}

                        {/* ── SOCIAL TAB ── */}
                        {tab === 'social' && (
                            <div className="hbe-section">
                                <div className="hbe-section-title">🌐 Social Media Links</div>
                                <p className="hbe-section-desc">Optional links shown in patient-facing portals and emails.</p>
                                <div className="hbe-grid-2">
                                    <TextField label="Instagram" name="instagramUrl" value={form.instagramUrl} onChange={handleChange} placeholder="https://instagram.com/hospital" />
                                    <TextField label="Facebook" name="facebookUrl" value={form.facebookUrl} onChange={handleChange} placeholder="https://facebook.com/hospital" />
                                </div>
                                <div className="hbe-grid-2">
                                    <TextField label="Twitter / X" name="twitterUrl" value={form.twitterUrl} onChange={handleChange} placeholder="https://twitter.com/hospital" />
                                    <div className="hbe-field">
                                        <label className="hbe-field-label">Preview</label>
                                        <div className="hbe-social-preview">
                                            {form.instagramUrl && <a href={form.instagramUrl} target="_blank" rel="noreferrer" className="hbe-social-chip">📸 Instagram</a>}
                                            {form.facebookUrl  && <a href={form.facebookUrl}  target="_blank" rel="noreferrer" className="hbe-social-chip">💬 Facebook</a>}
                                            {form.twitterUrl   && <a href={form.twitterUrl}   target="_blank" rel="noreferrer" className="hbe-social-chip">🐦 Twitter</a>}
                                            {!form.instagramUrl && !form.facebookUrl && !form.twitterUrl && (
                                                <span style={{ color: 'var(--gray-400)', fontSize: '0.82rem' }}>No social links set yet.</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                )}

                {/* ── Footer Actions ── */}
                <div className="hbe-footer">
                    <button className="hbe-btn-ghost" onClick={handleReset}>↺ Reset to Defaults</button>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className="hbe-btn-preview" onClick={handlePreview} disabled={saving}>
                            {saving ? '⏳ Saving…' : '👁 Save & Preview'}
                        </button>
                        <button className="hbe-btn-save" onClick={handleSave} disabled={saving}>
                            {saving ? '⏳ Saving…' : '💾 Save Branding'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HospitalBrandingEditor;
