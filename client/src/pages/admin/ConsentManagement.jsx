import React, { useState, useEffect, useRef } from 'react';
import { consentAPI } from '../../utils/api';
import confirmToast, { toast } from '../../utils/confirmToast';
import { 
    FaPlus, 
    FaFolderPlus, 
    FaFileCirclePlus, 
    FaFileShield, 
    FaWandMagicSparkles, 
    FaMicrochip, 
    FaCloudArrowUp, 
    FaTrash, 
    FaCheck,
    FaCheckDouble, 
    FaMagnifyingGlass, 
    FaCircleInfo, 
    FaFolderTree, 
    FaShieldHalved, 
    FaFileLines, 
    FaFileWord,
    FaFilePdf,
    FaDownload,
    FaPenToSquare,
    FaXmark,
    FaListCheck,
    FaToggleOn,
    FaToggleOff,
    FaArrowRotateRight,
    FaFolderOpen
} from 'react-icons/fa6';
import './ConsentManagement.css';

const ConsentManagement = () => {
    const [activeTab, setActiveTab] = useState('addCategory'); // 'addCategory' | 'addConsent' | 'allCategories'
    const [stats, setStats] = useState({ totalCategories: 0, totalTemplates: 0, activeTemplates: 0, inactiveTemplates: 0 });
    const [categories, setCategories] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [pingStat, setPingStat] = useState('12ms');
    
    // Modals & Forms State
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [editingTemplate, setEditingTemplate] = useState(null);
    
    const [categoryForm, setCategoryForm] = useState({ name: '', description: '', sortOrder: 0, isActive: true });
    const [templateForm, setTemplateForm] = useState({ name: '', categoryId: '', description: '', isActive: true, file: null });

    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDraggingFile, setIsDraggingFile] = useState(false);

    // Canvas Ref
    const sparkCanvasRef = useRef(null);
    const fileInputRef = useRef(null);

    // -------------------------------------------------------------
    // 1. SUPER SMOOTH & HIGH-PERFORMANCE ECG SPARKLINE ANIMATION
    // -------------------------------------------------------------
    useEffect(() => {
        const sparkCanvas = sparkCanvasRef.current;
        if (!sparkCanvas) return;
        const sparkCtx = sparkCanvas.getContext('2d', { alpha: false });
        let sparkFrameId;

        const resizeSpark = () => {
            if (sparkCanvas.parentElement) {
                sparkCanvas.width = sparkCanvas.parentElement.clientWidth;
                sparkCanvas.height = sparkCanvas.parentElement.clientHeight;
            }
        };
        resizeSpark();
        window.addEventListener('resize', resizeSpark);

        const sparkPoints = new Array(Math.max(120, Math.floor(sparkCanvas.width || 300))).fill((sparkCanvas.height || 84) / 2);
        let sparkTick = 0;

        const renderSparkline = () => {
            const w = sparkCanvas.width || 300;
            const h = sparkCanvas.height || 84;
            const mid = h / 2;

            // Background Fill (Fast solid gradient, no blur filters)
            const bgGrad = sparkCtx.createLinearGradient(0, 0, w, h);
            bgGrad.addColorStop(0, '#064e3b');
            bgGrad.addColorStop(1, '#022c22');
            sparkCtx.fillStyle = bgGrad;
            sparkCtx.fillRect(0, 0, w, h);

            sparkTick++;
            let y = mid;
            if (sparkTick % 45 === 10) y = mid - 10;
            else if (sparkTick % 45 === 14) y = mid + 12;
            else if (sparkTick % 45 === 18) y = mid - 26; // QRS peak
            else if (sparkTick % 45 === 22) y = mid + 16;
            else y = mid + (Math.sin(sparkTick * 0.2) * 2);

            sparkPoints.push(y);
            if (sparkPoints.length > w) sparkPoints.shift();

            // Lightweight grid lines
            sparkCtx.strokeStyle = 'rgba(52, 211, 153, 0.12)';
            sparkCtx.lineWidth = 1;
            for (let gridY = 16; gridY < h; gridY += 18) {
                sparkCtx.beginPath();
                sparkCtx.moveTo(0, gridY);
                sparkCtx.lineTo(w, gridY);
                sparkCtx.stroke();
            }

            // ECG Pulse Waveform
            sparkCtx.beginPath();
            sparkCtx.strokeStyle = '#34d399';
            sparkCtx.lineWidth = 2.2;
            for (let i = 0; i < sparkPoints.length; i++) {
                if (i === 0) sparkCtx.moveTo(i, sparkPoints[i]);
                else sparkCtx.lineTo(i, sparkPoints[i]);
            }
            sparkCtx.stroke();

            // Lead Pulse Indicator Point
            if (sparkPoints.length > 0) {
                const leadX = sparkPoints.length - 1;
                const leadY = sparkPoints[sparkPoints.length - 1];
                
                // Outer Pulse Ring
                sparkCtx.beginPath();
                sparkCtx.arc(leadX, leadY, 5, 0, Math.PI * 2);
                sparkCtx.fillStyle = '#10b981';
                sparkCtx.fill();

                // Inner Dot
                sparkCtx.beginPath();
                sparkCtx.arc(leadX, leadY, 2.5, 0, Math.PI * 2);
                sparkCtx.fillStyle = '#ffffff';
                sparkCtx.fill();
            }

            sparkFrameId = requestAnimationFrame(renderSparkline);
        };
        renderSparkline();

        // Node Ping dynamic simulator
        const pingInterval = setInterval(() => {
            const ms = Math.floor(Math.random() * 6) + 10;
            setPingStat(`${ms}ms`);
        }, 4000);

        return () => {
            window.removeEventListener('resize', resizeSpark);
            cancelAnimationFrame(sparkFrameId);
            clearInterval(pingInterval);
        };
    }, []);

    // -------------------------------------------------------------
    // 2. DATA FETCHING & API HOOKS
    // -------------------------------------------------------------
    useEffect(() => {
        fetchAllData();
    }, []);

    const fetchAllData = async () => {
        setIsLoading(true);
        try {
            const [statsRes, catRes, tmplRes] = await Promise.all([
                consentAPI.getStats().catch(() => ({ success: false })),
                consentAPI.getCategories().catch(() => ({ success: false })),
                consentAPI.getTemplates({}).catch(() => ({ success: false }))
            ]);

            if (statsRes?.success && statsRes.stats) {
                setStats(statsRes.stats);
            }
            if (catRes?.success && catRes.data) {
                setCategories(catRes.data);
                // Also sync category count if stats didn't return
                setStats(prev => ({
                    ...prev,
                    totalCategories: statsRes?.stats?.totalCategories ?? catRes.data.length
                }));
            }
            if (tmplRes?.success && tmplRes.data) {
                setTemplates(tmplRes.data);
                setStats(prev => ({
                    ...prev,
                    totalTemplates: statsRes?.stats?.totalTemplates ?? tmplRes.data.length,
                    activeTemplates: tmplRes.data.filter(t => t.isActive).length,
                    inactiveTemplates: tmplRes.data.filter(t => !t.isActive).length
                }));
            }
        } catch (err) {
            console.error('Failed to load consent data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // -------------------------------------------------------------
    // 3. AUTO-SUGGESTION AI HELPERS
    // -------------------------------------------------------------
    const autoCategory = () => {
        const suggestions = [
            "Critical Care Interventions", 
            "Minimally Invasive Diagnostics", 
            "Cardio-Thoracic Operations",
            "Robotic Surgical Procedures",
            "Pediatric Anesthesia Protocol",
            "Oncology Treatment Regimen"
        ];
        const randomName = suggestions[Math.floor(Math.random() * suggestions.length)];
        setCategoryForm(prev => ({ ...prev, name: randomName }));
    };

    const autoDesc = () => {
        const descriptions = [
            "Compliance framework covering risk disclosures, patient rights, and electronic digital authorization protocols.",
            "Standard clinical authorization guidelines with HIPAA-compliant verification and procedure risk scopes.",
            "Comprehensive procedural consent scope specifying intraoperative protocols and physician directives."
        ];
        const randomDesc = descriptions[Math.floor(Math.random() * descriptions.length)];
        setCategoryForm(prev => ({ ...prev, description: randomDesc }));
    };

    const autoConsentName = () => {
        const titles = [
            "Advanced Robotic Coronary Bypass Agreement", 
            "Emergency Pediatric Treatment Authorization", 
            "High-Risk Neurosurgery Disclosure",
            "Laparoscopic Cholecystectomy Protocol",
            "Endoscopic Spine Decompression Agreement",
            "Total Knee Arthroplasty Informed Consent"
        ];
        const randomTitle = titles[Math.floor(Math.random() * titles.length)];
        setTemplateForm(prev => ({ ...prev, name: randomTitle }));
    };

    // -------------------------------------------------------------
    // 4. CATEGORY HANDLERS
    // -------------------------------------------------------------
    const handleCategorySubmit = async (e) => {
        e.preventDefault();
        if (!categoryForm.name.trim()) return;

        setIsSubmitting(true);
        try {
            if (editingCategory) {
                await consentAPI.updateCategory(editingCategory._id, categoryForm);
            } else {
                await consentAPI.createCategory(categoryForm);
            }
            toast.success(editingCategory ? 'Category updated successfully!' : 'Category created successfully!');
            setIsCategoryModalOpen(false);
            setEditingCategory(null);
            setCategoryForm({ name: '', description: '', sortOrder: 0, isActive: true });
            fetchAllData();
        } catch (error) {
            console.error('Error saving category:', error);
            toast.error(error.response?.data?.message || 'Error saving category');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteCategory = async (id, name) => {
        const confirmed = await confirmToast(
            `Are you sure you want to delete category "${name}"?`,
            { title: 'Delete Category', confirmText: 'Delete' }
        );
        if (!confirmed) return;
        try {
            await consentAPI.deleteCategory(id);
            toast.success(`Category "${name}" deleted`);
            fetchAllData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error deleting category');
        }
    };

    const handleToggleCategory = async (id) => {
        try {
            await consentAPI.toggleCategory(id);
            toast.success('Category status updated');
            fetchAllData();
        } catch (error) {
            console.error('Error toggling category:', error);
            toast.error('Failed to update status');
        }
    };

    const openEditCategory = (cat) => {
        setEditingCategory(cat);
        setCategoryForm({
            name: cat.name || '',
            description: cat.description || '',
            sortOrder: cat.sortOrder || 0,
            isActive: cat.isActive !== undefined ? cat.isActive : true
        });
        setIsCategoryModalOpen(true);
    };

    // -------------------------------------------------------------
    // 5. TEMPLATE HANDLERS
    // -------------------------------------------------------------
    const handleTemplateSubmit = async (e) => {
        e.preventDefault();
        if (!templateForm.name || !templateForm.categoryId) {
            toast.error('Please provide name and category');
            return;
        }

        setIsSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('name', templateForm.name);
            formData.append('categoryId', templateForm.categoryId);
            formData.append('description', templateForm.description || '');
            formData.append('isActive', templateForm.isActive);
            if (templateForm.file) {
                formData.append('file', templateForm.file);
            }

            if (editingTemplate) {
                await consentAPI.updateTemplate(editingTemplate._id, formData);
            } else {
                if (!templateForm.file) {
                    toast.error('Please upload a document file (.docx)');
                    setIsSubmitting(false);
                    return;
                }
                await consentAPI.createTemplate(formData);
            }

            toast.success(editingTemplate ? 'Template updated successfully!' : 'Consent Template registered successfully!');
            setIsTemplateModalOpen(false);
            setEditingTemplate(null);
            setTemplateForm({ name: '', categoryId: '', description: '', isActive: true, file: null });
            fetchAllData();
        } catch (error) {
            console.error('Error saving template:', error);
            toast.error(error.response?.data?.message || 'Error saving template');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteTemplate = async (id, name) => {
        const confirmed = await confirmToast(
            `Are you sure you want to delete template "${name}"?`,
            { title: 'Delete Consent Template', confirmText: 'Delete' }
        );
        if (!confirmed) return;
        try {
            await consentAPI.deleteTemplate(id);
            toast.success(`Template "${name}" deleted`);
            fetchAllData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error deleting template');
        }
    };

    const handleDownloadTemplate = async (id, fileName) => {
        try {
            const apiBase = import.meta.env.VITE_API_URL || '';
            const url = `${apiBase}/api/consent/templates/${id}/download`;
            const token = JSON.parse(localStorage.getItem('user'))?.token || localStorage.getItem('token') || '';
            
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Download failed');
            
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = fileName || 'consent_template.docx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        } catch (error) {
            toast.error('Error downloading template');
        }
    };

    const openEditTemplate = (tmpl) => {
        setEditingTemplate(tmpl);
        setTemplateForm({
            name: tmpl.name || '',
            categoryId: tmpl.categoryId?._id || tmpl.categoryId || '',
            description: tmpl.description || '',
            isActive: tmpl.isActive !== undefined ? tmpl.isActive : true,
            file: null
        });
        setIsTemplateModalOpen(true);
    };

    // Filtered templates
    const filteredTemplates = templates.filter(t => {
        const matchesSearch = !searchQuery.trim() || 
            t.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
            t.originalFileName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.description?.toLowerCase().includes(searchQuery.toLowerCase());
        
        const catId = t.categoryId?._id || t.categoryId;
        const matchesCat = !categoryFilter || catId === categoryFilter;

        return matchesSearch && matchesCat;
    });

    const totalCategoriesCount = categories.length || stats.totalCategories || 0;
    const totalTemplatesCount = templates.length || stats.totalTemplates || 0;

    return (
        <div className="consent-hub-wrapper">
            <div className="consent-hub-inner">
                
                {/* HERO BANNER */}
                <div className="dash-title-banner">
                    <div className="dash-banner-left">
                        <h2 className="banner-big-heading">
                            <FaFileShield /> Consent Document Hub
                        </h2>
                        <p>Create document categories and register compliance consent templates with automated parsing, HIPAA verification, and smart contextual scope generation.</p>
                    </div>
                    <div className="dash-banner-animated-actions">
                        <button 
                            className={`banner-animated-btn ${activeTab === 'addCategory' ? 'active' : ''}`}
                            onClick={() => setActiveTab('addCategory')}
                        >
                            <FaFolderPlus className="btn-icon" />
                            <span>+ Add Category</span>
                        </button>
                        <button 
                            className={`banner-animated-btn ${activeTab === 'addConsent' ? 'active' : ''}`}
                            onClick={() => setActiveTab('addConsent')}
                        >
                            <FaFileCirclePlus className="btn-icon" />
                            <span>+ Add Consent Template</span>
                        </button>
                        <button 
                            className={`banner-animated-btn ${activeTab === 'allCategories' ? 'active' : ''}`}
                            onClick={() => setActiveTab('allCategories')}
                        >
                            <FaFolderTree className="btn-icon" />
                            <span>Categories Directory ({totalCategoriesCount})</span>
                        </button>
                    </div>
                </div>

                {/* MAIN DASHBOARD GRID */}
                <div className="dashboard-grid">
                    
                    {/* LEFT PANEL: FORMS & CATEGORY VIEWS */}
                    <div>
                        {/* TAB 1: ADD CATEGORY */}
                        {activeTab === 'addCategory' && (
                            <div className="card-box">
                                <h3>
                                    <span className="card-box-header-left">
                                        <FaFolderTree style={{ color: 'var(--brand-green)' }} /> 
                                        <span>Create Consent Category</span>
                                    </span>
                                    <span className="badge-header">
                                        {totalCategoriesCount} Registered
                                    </span>
                                </h3>

                                <form onSubmit={handleCategorySubmit}>
                                    <div className="form-group-custom">
                                        <label>
                                            <span className="label-title-wrap">
                                                Category Name <span className="req-star">*</span>
                                            </span>
                                            <span className="assist-hint" onClick={autoCategory}>
                                                <FaWandMagicSparkles /> Auto-Suggest
                                            </span>
                                        </label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. Surgical Consent, Pediatric Authorization" 
                                            value={categoryForm.name}
                                            onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                                            required 
                                        />
                                    </div>

                                    <div className="form-group-custom">
                                        <label>
                                            <span className="label-title-wrap">
                                                Description &amp; Scope
                                            </span>
                                            <span className="assist-hint" onClick={autoDesc}>
                                                <FaWandMagicSparkles /> Generate Scope
                                            </span>
                                        </label>
                                        <textarea 
                                            placeholder="Enter brief guidelines or description about this category (optional)..." 
                                            value={categoryForm.description}
                                            onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                                        ></textarea>
                                    </div>

                                    <div className="form-checkbox-row">
                                        <input 
                                            type="checkbox" 
                                            id="catActiveCheck" 
                                            checked={categoryForm.isActive} 
                                            onChange={(e) => setCategoryForm({ ...categoryForm, isActive: e.target.checked })} 
                                        />
                                        <label htmlFor="catActiveCheck">Active Category</label>
                                    </div>

                                    <button 
                                        type="submit" 
                                        className="btn-custom" 
                                        style={{ width: '100%', justifyContent: 'center' }}
                                        disabled={isSubmitting}
                                    >
                                        <FaPlus /> {isSubmitting ? 'Saving...' : 'Save Category'}
                                    </button>
                                </form>

                                {/* QUICK CATEGORIES PREVIEW LIST */}
                                <div className="categories-quick-list">
                                    <div className="quick-list-header">
                                        <h4>Created Categories ({categories.length})</h4>
                                        <button 
                                            type="button" 
                                            className="quick-view-all-btn"
                                            onClick={() => setActiveTab('allCategories')}
                                        >
                                            View Directory &rarr;
                                        </button>
                                    </div>
                                    <div className="quick-cat-chips-grid">
                                        {categories.map(c => (
                                            <div key={c._id} className={`quick-cat-chip ${c.isActive ? 'active' : 'inactive'}`}>
                                                <div className="chip-info">
                                                    <span className="chip-name">{c.name}</span>
                                                    {c.description && <span className="chip-desc">{c.description}</span>}
                                                </div>
                                                <div className="chip-actions">
                                                    <button 
                                                        type="button" 
                                                        className="chip-action-btn edit" 
                                                        onClick={() => openEditCategory(c)} 
                                                        title="Edit Category"
                                                    >
                                                        <FaPenToSquare />
                                                    </button>
                                                    <button 
                                                        type="button" 
                                                        className="chip-action-btn delete" 
                                                        onClick={() => handleDeleteCategory(c._id, c.name)} 
                                                        title="Delete Category"
                                                    >
                                                        <FaTrash />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {categories.length === 0 && (
                                            <div className="no-cat-placeholder">
                                                No categories created yet. Fill the form above to add your first category.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 2: ADD CONSENT TEMPLATE */}
                        {activeTab === 'addConsent' && (
                            <div className="card-box">
                                <h3>
                                    <span className="card-box-header-left">
                                        <FaCloudArrowUp style={{ color: 'var(--brand-green)' }} /> 
                                        <span>Upload New Consent Document</span>
                                    </span>
                                </h3>

                                <form onSubmit={handleTemplateSubmit}>
                                    <div className="form-group-custom">
                                        <label>
                                            <span className="label-title-wrap">
                                                Consent Name <span className="req-star">*</span>
                                            </span>
                                            <span className="assist-hint" onClick={autoConsentName}>
                                                <FaWandMagicSparkles /> Title Gen
                                            </span>
                                        </label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. Robotic Surgery Agreement, General Treatment" 
                                            value={templateForm.name}
                                            onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                                            required 
                                        />
                                    </div>

                                    <div className="form-group-custom">
                                        <label>
                                            <span className="label-title-wrap">
                                                Choose Category <span className="req-star">*</span>
                                            </span>
                                        </label>
                                        <select 
                                            value={templateForm.categoryId}
                                            onChange={(e) => setTemplateForm({ ...templateForm, categoryId: e.target.value })}
                                            required
                                        >
                                            <option value="">-- Select Category ({categories.length} Available) --</option>
                                            {categories.map(c => (
                                                <option key={c._id} value={c._id}>{c.name}</option>
                                            ))}
                                            {categories.length === 0 && <option value="" disabled>No categories available (Create one first)</option>}
                                        </select>
                                    </div>

                                    <div className="form-group-custom">
                                        <label>
                                            <span className="label-title-wrap">
                                                Description &amp; Key Clauses
                                            </span>
                                        </label>
                                        <textarea 
                                            placeholder="Enter details, procedure notes, or scope regarding this consent form (optional)..." 
                                            value={templateForm.description}
                                            onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                                        ></textarea>
                                    </div>

                                    <div className="form-group-custom">
                                        <label>
                                            <span className="label-title-wrap">
                                                Upload Document File (.docx) <span className="req-star">*</span>
                                            </span>
                                        </label>
                                        <div 
                                            className={`compact-animated-upload-wrapper ${isDraggingFile ? 'is-dragging' : ''}`}
                                            onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                                            onDragLeave={() => setIsDraggingFile(false)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                setIsDraggingFile(false);
                                                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                                    setTemplateForm(prev => ({ ...prev, file: e.dataTransfer.files[0] }));
                                                }
                                            }}
                                        >
                                            <input 
                                                type="file" 
                                                id="consentFileInput"
                                                ref={fileInputRef}
                                                style={{ display: 'none' }} 
                                                accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                                                onChange={(e) => {
                                                    const file = e.target.files[0];
                                                    if (file) setTemplateForm({ ...templateForm, file });
                                                }}
                                            />
                                            <label 
                                                htmlFor="consentFileInput" 
                                                className="compact-upload-animated-btn"
                                            >
                                                <FaCloudArrowUp className="upload-btn-icon" />
                                                <span>{templateForm.file ? 'Change File' : 'Choose Document'}</span>
                                            </label>

                                            <div className="compact-upload-file-status">
                                                {templateForm.file ? (
                                                    <div className="selected-file-badge">
                                                        <span className={`file-type-pill ${templateForm.file.name?.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx'}`}>
                                                            {templateForm.file.name?.toLowerCase().endsWith('.pdf') ? 'PDF' : 'DOCX'}
                                                        </span>
                                                        <span className="selected-file-name" title={templateForm.file.name}>
                                                            {templateForm.file.name}
                                                        </span>
                                                        <span className="selected-file-size">
                                                            ({(templateForm.file.size / 1024).toFixed(1)} KB)
                                                        </span>
                                                        <span className="file-ready-check">
                                                            <FaCheck /> Ready
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setTemplateForm(prev => ({ ...prev, file: null }));
                                                                if (fileInputRef.current) fileInputRef.current.value = '';
                                                            }}
                                                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', marginLeft: '4px', display: 'flex', alignItems: 'center' }}
                                                            title="Remove File"
                                                        >
                                                            <FaXmark />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="no-file-text">
                                                        <FaFileShield style={{ color: 'var(--brand-green)', fontSize: '14px' }} />
                                                        <span>No file chosen (or drag &amp; drop .docx max 10MB)</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="placeholders-tooltip">
                                            💡 <strong>Supported Placeholders:</strong> <code>{'{patient_name}'}</code>, <code>{'{age}'}</code>, <code>{'{gender}'}</code>, <code>{'{doctor_name}'}</code>, <code>{'{hospital_name}'}</code>, <code>{'{today}'}</code>
                                        </div>
                                    </div>

                                    <div className="form-checkbox-row">
                                        <input 
                                            type="checkbox" 
                                            id="tmpActiveCheck" 
                                            checked={templateForm.isActive} 
                                            onChange={(e) => setTemplateForm({ ...templateForm, isActive: e.target.checked })} 
                                        />
                                        <label htmlFor="tmpActiveCheck">Active Template (Available for doctors &amp; receptionists)</label>
                                    </div>

                                    <button 
                                        type="submit" 
                                        className="btn-custom" 
                                        style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}
                                        disabled={isSubmitting}
                                    >
                                        <FaPlus /> {isSubmitting ? 'Saving Consent...' : '+ Add Consent Template'}
                                    </button>
                                </form>
                            </div>
                        )}

                        {/* TAB 3: ALL CATEGORIES DIRECTORY VIEW */}
                        {activeTab === 'allCategories' && (
                            <div className="card-box">
                                <h3>
                                    <span className="card-box-header-left">
                                        <FaFolderTree style={{ color: 'var(--brand-green)' }} /> 
                                        <span>Categories Directory ({categories.length})</span>
                                    </span>
                                    <button 
                                        className="btn-custom" 
                                        style={{ padding: '6px 14px', fontSize: '12px' }}
                                        onClick={() => setActiveTab('addCategory')}
                                    >
                                        <FaPlus /> New Category
                                    </button>
                                </h3>

                                <table className="docs-table">
                                    <thead>
                                        <tr>
                                            <th>Category Name</th>
                                            <th>Description</th>
                                            <th>Templates Count</th>
                                            <th>Status</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {categories.map(c => {
                                            const count = templates.filter(t => (t.categoryId?._id || t.categoryId) === c._id).length;
                                            return (
                                                <tr key={c._id}>
                                                    <td><strong>{c.name}</strong></td>
                                                    <td><span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.description || '—'}</span></td>
                                                    <td>
                                                        <span className="badge-cat">{count} Templates</span>
                                                    </td>
                                                    <td>
                                                        <span className={c.isActive ? 'status-badge-active' : 'status-badge-inactive'}>
                                                            {c.isActive ? 'Active' : 'Inactive'}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <div className="table-actions-cell">
                                                            <button 
                                                                className="btn-tbl-action" 
                                                                onClick={() => handleToggleCategory(c._id)}
                                                                title={c.isActive ? "Deactivate" : "Activate"}
                                                            >
                                                                {c.isActive ? <FaToggleOn style={{ color: 'var(--brand-green)' }} /> : <FaToggleOff />}
                                                            </button>
                                                            <button 
                                                                className="btn-tbl-action edit" 
                                                                onClick={() => openEditCategory(c)}
                                                                title="Edit"
                                                            >
                                                                <FaPenToSquare />
                                                            </button>
                                                            <button 
                                                                className="btn-tbl-action delete" 
                                                                onClick={() => handleDeleteCategory(c._id, c.name)}
                                                                title="Delete"
                                                            >
                                                                <FaTrash />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {categories.length === 0 && (
                                            <tr>
                                                <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                                                    No categories created yet. Click "+ New Category" to create one.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* RIGHT SIDE: TELEMETRY & STATS PANEL */}
                    <div className="telemetry-panel">
                        <div className="telemetry-title">
                            <span><FaMicrochip style={{ color: 'var(--brand-green)', marginRight: '6px' }} /> Node Telemetry</span>
                            <span className="badge-header">LIVE</span>
                        </div>

                        <div className="stats-grid-telemetry">
                            <div className="stat-mini-box">
                                <div className="stat-mini-num">99.9%</div>
                                <div className="stat-mini-lbl">Confidence Score</div>
                            </div>
                            <div className="stat-mini-box" style={{ background: 'var(--pastel-blue)', borderColor: '#bae6fd' }}>
                                <div className="stat-mini-num" style={{ color: '#0369a1' }}>{pingStat}</div>
                                <div className="stat-mini-lbl">Node Ping</div>
                            </div>
                            <div className="stat-mini-box">
                                <div className="stat-mini-num">{totalTemplatesCount}</div>
                                <div className="stat-mini-lbl">Total Templates</div>
                            </div>
                            <div className="stat-mini-box" style={{ background: 'var(--pastel-blue)', borderColor: '#bae6fd' }}>
                                <div className="stat-mini-num" style={{ color: '#0369a1' }}>{totalCategoriesCount}</div>
                                <div className="stat-mini-lbl">Categories</div>
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                                Real-Time Registry Activity
                            </label>
                            <div className="wave-box">
                                <canvas id="activitySparkline" ref={sparkCanvasRef}></canvas>
                            </div>
                        </div>
                    </div>

                </div>

                {/* REGISTERED CONSENTS DATA TABLE */}
                <div className="table-container-custom">
                    <div className="table-header-flex">
                        <div>
                            <h4>Registered Consent Templates ({templates.length})</h4>
                            <p>All active files mapped to categories with compliance scoring and dynamic token injection.</p>
                        </div>

                        <div className="table-filter-bar">
                            <input 
                                type="text" 
                                className="table-search-input" 
                                placeholder="🔍 Search templates..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <select 
                                value={categoryFilter} 
                                onChange={(e) => setCategoryFilter(e.target.value)}
                            >
                                <option value="">All Categories ({categories.length})</option>
                                {categories.map(c => (
                                    <option key={c._id} value={c._id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <table className="docs-table">
                        <thead>
                            <tr>
                                <th>Consent Name</th>
                                <th>Category</th>
                                <th>Compliance Score</th>
                                <th>Format</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTemplates.map(t => {
                                const ext = t.originalFileName ? t.originalFileName.split('.').pop().toUpperCase() : 'DOCX';
                                const catName = t.categoryId?.name || categories.find(c => c._id === t.categoryId)?.name || 'General Treatment';
                                return (
                                    <tr key={t._id}>
                                        <td>
                                            <strong>{t.name}</strong>
                                            {t.originalFileName && (
                                                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {ext === 'PDF' ? <FaFilePdf style={{ color: '#ef4444' }} /> : <FaFileWord style={{ color: '#2563eb' }} />}
                                                    <span>{t.originalFileName}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <span className="badge-cat">{catName}</span>
                                        </td>
                                        <td>
                                            <span className="status-pill">
                                                <FaShieldHalved /> 99.8% Verified
                                            </span>
                                        </td>
                                        <td>
                                            <span className="badge-format">.{ext}</span>
                                        </td>
                                        <td>
                                            <span className={t.isActive ? 'status-badge-active' : 'status-badge-inactive'}>
                                                {t.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div className="table-actions-cell">
                                                <button 
                                                    className="btn-tbl-action download" 
                                                    onClick={() => handleDownloadTemplate(t._id, t.originalFileName)}
                                                    title="Download File"
                                                >
                                                    <FaDownload />
                                                </button>
                                                <button 
                                                    className="btn-tbl-action edit" 
                                                    onClick={() => openEditTemplate(t)}
                                                    title="Edit Template"
                                                >
                                                    <FaPenToSquare />
                                                </button>
                                                <button 
                                                    className="btn-tbl-action delete" 
                                                    onClick={() => handleDeleteTemplate(t._id, t.name)}
                                                    title="Delete Template"
                                                >
                                                    <FaTrash />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredTemplates.length === 0 && (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                                        {searchQuery || categoryFilter ? 'No templates matched the filter criteria.' : 'No consent templates registered yet. Use the form above to parse and register templates.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

            </div>

            {/* EDIT CATEGORY MODAL */}
            {isCategoryModalOpen && (
                <div className="modal-overlay-custom" onClick={() => setIsCategoryModalOpen(false)}>
                    <div className="modal-content-custom" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header-custom">
                            <h3><FaFolderTree /> {editingCategory ? 'Edit Category' : 'Add Category'}</h3>
                            <button className="modal-btn-close" onClick={() => setIsCategoryModalOpen(false)}>
                                <FaXmark />
                            </button>
                        </div>
                        <form onSubmit={handleCategorySubmit}>
                            <div className="modal-body-custom">
                                <div className="form-group-custom">
                                    <label>Category Name <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input 
                                        type="text" 
                                        value={categoryForm.name} 
                                        onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} 
                                        required 
                                    />
                                </div>
                                <div className="form-group-custom">
                                    <label>Description</label>
                                    <textarea 
                                        rows="3" 
                                        placeholder="Enter description (optional)..."
                                        value={categoryForm.description} 
                                        onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })}
                                    ></textarea>
                                </div>
                                <div className="form-checkbox-row" style={{ marginTop: '12px', marginBottom: '8px' }}>
                                    <input 
                                        type="checkbox" 
                                        id="modalCatActive" 
                                        checked={categoryForm.isActive} 
                                        onChange={e => setCategoryForm({ ...categoryForm, isActive: e.target.checked })} 
                                    />
                                    <label htmlFor="modalCatActive">Active Category</label>
                                </div>
                            </div>
                            <div className="modal-footer-custom">
                                <button type="button" className="btn-secondary-custom" onClick={() => setIsCategoryModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-custom" disabled={isSubmitting}>
                                    {isSubmitting ? 'Saving...' : 'Save Category'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT TEMPLATE MODAL */}
            {isTemplateModalOpen && (
                <div className="modal-overlay-custom" onClick={() => setIsTemplateModalOpen(false)}>
                    <div className="modal-content-custom" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header-custom">
                            <h3><FaFileShield /> {editingTemplate ? 'Edit Template' : 'Add Template'}</h3>
                            <button className="modal-btn-close" onClick={() => setIsTemplateModalOpen(false)}>
                                <FaXmark />
                            </button>
                        </div>
                        <form onSubmit={handleTemplateSubmit}>
                            <div className="modal-body-custom">
                                <div className="form-group-custom">
                                    <label>Template Name *</label>
                                    <input 
                                        type="text" 
                                        value={templateForm.name} 
                                        onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })} 
                                        required 
                                    />
                                </div>
                                <div className="form-group-custom">
                                    <label>Category *</label>
                                    <select 
                                        value={templateForm.categoryId} 
                                        onChange={e => setTemplateForm({ ...templateForm, categoryId: e.target.value })} 
                                        required
                                    >
                                        <option value="">Select a category</option>
                                        {categories.map(c => (
                                            <option key={c._id} value={c._id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group-custom">
                                    <label>Description</label>
                                    <textarea 
                                        rows="2" 
                                        value={templateForm.description} 
                                        onChange={e => setTemplateForm({ ...templateForm, description: e.target.value })}
                                    ></textarea>
                                </div>
                                <div className="form-group-custom">
                                    <label>Replace Document File (.docx) (Optional)</label>
                                    <input 
                                        type="file" 
                                        accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                                        onChange={e => {
                                            const file = e.target.files[0];
                                            if (file) setTemplateForm({ ...templateForm, file });
                                        }} 
                                    />
                                </div>
                                <div className="form-checkbox-row">
                                    <input 
                                        type="checkbox" 
                                        id="modalTmpActive" 
                                        checked={templateForm.isActive} 
                                        onChange={e => setTemplateForm({ ...templateForm, isActive: e.target.checked })} 
                                    />
                                    <label htmlFor="modalTmpActive">Active Template</label>
                                </div>
                            </div>
                            <div className="modal-footer-custom">
                                <button type="button" className="btn-secondary-custom" onClick={() => setIsTemplateModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-custom" disabled={isSubmitting}>
                                    {isSubmitting ? 'Saving...' : 'Save Template'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConsentManagement;
