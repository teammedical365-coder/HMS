import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FiSliders, FiCheck, FiSave, FiArrowLeft, FiImage,
    FiFileText, FiRefreshCw
} from 'react-icons/fi';
import { labAPI } from '../../utils/api';

const LabReportTemplatePage = () => {
    const navigate = useNavigate();
    const [templates, setTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    const loadTemplates = async () => {
        setLoading(true);
        try {
            const res = await labAPI.reports.getTemplates();
            if (res.success && res.data?.length > 0) {
                setTemplates(res.data);
                setSelectedTemplate(res.data[0]);
            }
        } catch (err) {
            console.error('Failed to load templates:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTemplates();
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!selectedTemplate) return;

        setSaving(true);
        setMessage('');

        try {
            const res = await labAPI.reports.updateTemplate(selectedTemplate._id, selectedTemplate);
            if (res.success) {
                setMessage('Template branding saved successfully!');
                setTimeout(() => setMessage(''), 4000);
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to save template');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => navigate('/lab/reports')}
                        className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition"
                    >
                        <FiArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">White-label PDF Report Template Customizer</h1>
                        <p className="text-xs text-slate-500">
                            Configure diagnostic laboratory header branding, NABL accreditation text, signature blocks and color themes
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving || !selectedTemplate}
                    className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-sky-600 rounded-xl hover:bg-sky-700 shadow-sm transition disabled:opacity-50"
                >
                    <FiSave className="w-4 h-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Configuration'}
                </button>
            </div>

            {message && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center space-x-2">
                    <FiCheck className="w-4 h-4 text-emerald-600" />
                    <span>{message}</span>
                </div>
            )}

            {loading ? (
                <div className="text-center py-20 text-slate-400">Loading template configuration...</div>
            ) : selectedTemplate ? (
                <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Column 1: Hospital Header & Contact */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">
                            Laboratory Header & Branding
                        </h2>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Laboratory / Hospital Name</label>
                            <input
                                type="text"
                                value={selectedTemplate.hospitalHeader?.name || ''}
                                onChange={(e) => setSelectedTemplate({
                                    ...selectedTemplate,
                                    hospitalHeader: { ...selectedTemplate.hospitalHeader, name: e.target.value }
                                })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500/20"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Tagline</label>
                            <input
                                type="text"
                                value={selectedTemplate.hospitalHeader?.tagline || ''}
                                onChange={(e) => setSelectedTemplate({
                                    ...selectedTemplate,
                                    hospitalHeader: { ...selectedTemplate.hospitalHeader, tagline: e.target.value }
                                })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500/20"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
                            <input
                                type="text"
                                value={selectedTemplate.hospitalHeader?.address || ''}
                                onChange={(e) => setSelectedTemplate({
                                    ...selectedTemplate,
                                    hospitalHeader: { ...selectedTemplate.hospitalHeader, address: e.target.value }
                                })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500/20"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                                <input
                                    type="text"
                                    value={selectedTemplate.hospitalHeader?.phone || ''}
                                    onChange={(e) => setSelectedTemplate({
                                        ...selectedTemplate,
                                        hospitalHeader: { ...selectedTemplate.hospitalHeader, phone: e.target.value }
                                    })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500/20"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                                <input
                                    type="text"
                                    value={selectedTemplate.hospitalHeader?.email || ''}
                                    onChange={(e) => setSelectedTemplate({
                                        ...selectedTemplate,
                                        hospitalHeader: { ...selectedTemplate.hospitalHeader, email: e.target.value }
                                    })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500/20"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Accreditation & Certification Text</label>
                            <input
                                type="text"
                                value={selectedTemplate.hospitalHeader?.accreditationText || ''}
                                onChange={(e) => setSelectedTemplate({
                                    ...selectedTemplate,
                                    hospitalHeader: { ...selectedTemplate.hospitalHeader, accreditationText: e.target.value }
                                })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500/20"
                                placeholder="NABL (ISO 15189:2022) & CAP Certified Reference Laboratory"
                            />
                        </div>
                    </div>

                    {/* Column 2: Sign-off & Visual Palette */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">
                            Pathologist Signatory Block
                        </h2>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Signatory Pathologist Name</label>
                            <input
                                type="text"
                                value={selectedTemplate.signatureConfig?.signatoryName || ''}
                                onChange={(e) => setSelectedTemplate({
                                    ...selectedTemplate,
                                    signatureConfig: { ...selectedTemplate.signatureConfig, signatoryName: e.target.value }
                                })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500/20"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Designation & Qualifications</label>
                            <input
                                type="text"
                                value={selectedTemplate.signatureConfig?.signatoryDesignation || ''}
                                onChange={(e) => setSelectedTemplate({
                                    ...selectedTemplate,
                                    signatureConfig: { ...selectedTemplate.signatureConfig, signatoryDesignation: e.target.value }
                                })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500/20"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Medical Registration Number</label>
                            <input
                                type="text"
                                value={selectedTemplate.signatureConfig?.signatoryRegistration || ''}
                                onChange={(e) => setSelectedTemplate({
                                    ...selectedTemplate,
                                    signatureConfig: { ...selectedTemplate.signatureConfig, signatoryRegistration: e.target.value }
                                })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500/20"
                            />
                        </div>

                        <div className="pt-2">
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Color Palette (Hex Codes)</label>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <span className="text-[11px] text-slate-500">Primary Color</span>
                                    <div className="flex items-center space-x-2 mt-1">
                                        <input
                                            type="color"
                                            value={selectedTemplate.primaryColor || '#0284c7'}
                                            onChange={(e) => setSelectedTemplate({ ...selectedTemplate, primaryColor: e.target.value })}
                                            className="w-8 h-8 rounded border-none cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={selectedTemplate.primaryColor || '#0284c7'}
                                            onChange={(e) => setSelectedTemplate({ ...selectedTemplate, primaryColor: e.target.value })}
                                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[11px] text-slate-500">Accent Color</span>
                                    <div className="flex items-center space-x-2 mt-1">
                                        <input
                                            type="color"
                                            value={selectedTemplate.accentColor || '#0f172a'}
                                            onChange={(e) => setSelectedTemplate({ ...selectedTemplate, accentColor: e.target.value })}
                                            className="w-8 h-8 rounded border-none cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={selectedTemplate.accentColor || '#0f172a'}
                                            onChange={(e) => setSelectedTemplate({ ...selectedTemplate, accentColor: e.target.value })}
                                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Legal Disclaimer</label>
                            <textarea
                                rows="2"
                                value={selectedTemplate.disclaimer || ''}
                                onChange={(e) => setSelectedTemplate({ ...selectedTemplate, disclaimer: e.target.value })}
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500/20"
                            />
                        </div>
                    </div>
                </form>
            ) : null}
        </div>
    );
};

export default LabReportTemplatePage;
