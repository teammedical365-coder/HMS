import React, { useState, useEffect } from 'react';
import { consentAPI } from '../../utils/api';
import { FiFileText, FiFolder, FiCheckCircle, FiXCircle, FiPlus, FiEdit2, FiTrash2, FiDownload, FiEye, FiUploadCloud, FiX } from 'react-icons/fi';
import './ConsentManagement.css';

const ConsentManagement = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [stats, setStats] = useState({ totalCategories: 0, totalTemplates: 0, activeTemplates: 0, inactiveTemplates: 0 });
    const [categories, setCategories] = useState([]);
    const [templates, setTemplates] = useState([]);
    
    // Modals & Forms State
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [editingTemplate, setEditingTemplate] = useState(null);
    
    const [categoryForm, setCategoryForm] = useState({ name: '', description: '', sortOrder: 0, isActive: true });
    const [templateForm, setTemplateForm] = useState({ name: '', categoryId: '', description: '', isActive: true, file: null });

    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        fetchStats();
        if (activeTab === 'categories') fetchCategories();
        if (activeTab === 'templates') {
            fetchCategories();
            fetchTemplates();
        }
    }, [activeTab]);

    const fetchStats = async () => {
        try {
            const res = await consentAPI.getStats();
            if (res.success) setStats(res.stats);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    const fetchCategories = async () => {
        try {
            const res = await consentAPI.getCategories();
            if (res.success) setCategories(res.data);
        } catch (error) {
            console.error('Failed to fetch categories:', error);
        }
    };

    const fetchTemplates = async () => {
        try {
            const res = await consentAPI.getTemplates({});
            if (res.success) setTemplates(res.data);
        } catch (error) {
            console.error('Failed to fetch templates:', error);
        }
    };

    // Category Handlers
    const handleCategorySubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            if (editingCategory) {
                await consentAPI.updateCategory(editingCategory._id, categoryForm);
            } else {
                await consentAPI.createCategory(categoryForm);
            }
            fetchCategories();
            fetchStats();
            setIsCategoryModalOpen(false);
            setEditingCategory(null);
        } catch (error) {
            alert(error.response?.data?.message || 'Error saving category');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteCategory = async (id) => {
        if (!window.confirm('Are you sure you want to delete this category?')) return;
        try {
            await consentAPI.deleteCategory(id);
            fetchCategories();
            fetchStats();
        } catch (error) {
            alert(error.response?.data?.message || 'Error deleting category');
        }
    };

    const handleToggleCategory = async (id) => {
        try {
            await consentAPI.toggleCategory(id);
            fetchCategories();
        } catch (error) {
            console.error('Error toggling category:', error);
        }
    };

    const openCategoryModal = (category = null) => {
        if (category) {
            setEditingCategory(category);
            setCategoryForm({ name: category.name, description: category.description, sortOrder: category.sortOrder, isActive: category.isActive });
        } else {
            setEditingCategory(null);
            setCategoryForm({ name: '', description: '', sortOrder: 0, isActive: true });
        }
        setIsCategoryModalOpen(true);
    };

    // Template Handlers
    const handleTemplateSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        const formData = new FormData();
        formData.append('name', templateForm.name);
        formData.append('categoryId', templateForm.categoryId);
        formData.append('description', templateForm.description);
        formData.append('isActive', templateForm.isActive);
        if (templateForm.file) {
            formData.append('file', templateForm.file);
        } else if (!editingTemplate) {
            alert("File is required for new template");
            setIsLoading(false);
            return;
        }

        try {
            if (editingTemplate) {
                await consentAPI.updateTemplate(editingTemplate._id, formData);
            } else {
                await consentAPI.createTemplate(formData);
            }
            fetchTemplates();
            fetchStats();
            setIsTemplateModalOpen(false);
            setEditingTemplate(null);
        } catch (error) {
            alert(error.response?.data?.message || 'Error saving template');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteTemplate = async (id) => {
        if (!window.confirm('Are you sure you want to delete this template?')) return;
        try {
            await consentAPI.deleteTemplate(id);
            fetchTemplates();
            fetchStats();
        } catch (error) {
            alert(error.response?.data?.message || 'Error deleting template');
        }
    };

    const handleDownloadTemplate = async (id, fileName) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/consent/templates/${id}/download`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (!response.ok) throw new Error('Download failed');
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            alert('Error downloading template');
        }
    };

    const openTemplateModal = (template = null) => {
        if (template) {
            setEditingTemplate(template);
            setTemplateForm({ 
                name: template.name, 
                categoryId: template.categoryId?._id || '', 
                description: template.description, 
                isActive: template.isActive, 
                file: null 
            });
        } else {
            setEditingTemplate(null);
            setTemplateForm({ name: '', categoryId: '', description: '', isActive: true, file: null });
        }
        setIsTemplateModalOpen(true);
    };

    return (
        <div className="consent-management-container">
            <div className="consent-header">
                <h1 className="consent-title">Consent Management System</h1>
                <p className="consent-subtitle">Manage consent categories and dynamic Word templates for patients.</p>
            </div>

            <div className="consent-tabs">
                <button className={`consent-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
                <button className={`consent-tab-btn ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>Categories</button>
                <button className={`consent-tab-btn ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>Templates</button>
            </div>

            {activeTab === 'dashboard' && (
                <div className="consent-dashboard">
                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-icon blue"><FiFolder /></div>
                            <div className="stat-details">
                                <h3>Total Categories</h3>
                                <p>{stats.totalCategories}</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon purple"><FiFileText /></div>
                            <div className="stat-details">
                                <h3>Total Templates</h3>
                                <p>{stats.totalTemplates}</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon green"><FiCheckCircle /></div>
                            <div className="stat-details">
                                <h3>Active Templates</h3>
                                <p>{stats.activeTemplates}</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon orange"><FiXCircle /></div>
                            <div className="stat-details">
                                <h3>Inactive Templates</h3>
                                <p>{stats.inactiveTemplates}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'categories' && (
                <div className="consent-table-wrapper">
                    <div className="consent-table-header">
                        <h2>Manage Categories</h2>
                        <button className="consent-btn-primary" onClick={() => openCategoryModal()}>
                            <FiPlus /> Add Category
                        </button>
                    </div>
                    <table className="consent-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Description</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map(c => (
                                <tr key={c._id}>
                                    <td>{c.name}</td>
                                    <td>{c.description || '-'}</td>
                                    <td>
                                        <span className={`status-badge ${c.isActive ? 'active' : 'inactive'}`}>
                                            {c.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td>
                                        <button className="action-icon" onClick={() => openCategoryModal(c)}><FiEdit2 /></button>
                                        <button className="action-icon" onClick={() => handleToggleCategory(c._id)}>
                                            {c.isActive ? <FiXCircle title="Deactivate" /> : <FiCheckCircle title="Activate" />}
                                        </button>
                                        <button className="action-icon delete" onClick={() => handleDeleteCategory(c._id)}><FiTrash2 /></button>
                                    </td>
                                </tr>
                            ))}
                            {categories.length === 0 && <tr><td colSpan="4" style={{textAlign:'center'}}>No categories found.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'templates' && (
                <div className="consent-table-wrapper">
                    <div className="consent-table-header">
                        <h2>Manage Templates</h2>
                        <button className="consent-btn-primary" onClick={() => openTemplateModal()}>
                            <FiPlus /> Add Template
                        </button>
                    </div>
                    <table className="consent-table">
                        <thead>
                            <tr>
                                <th>Template Name</th>
                                <th>Category</th>
                                <th>File Name</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {templates.map(t => (
                                <tr key={t._id}>
                                    <td>{t.name}</td>
                                    <td>{t.categoryId?.name || 'N/A'}</td>
                                    <td>{t.originalFileName}</td>
                                    <td>
                                        <span className={`status-badge ${t.isActive ? 'active' : 'inactive'}`}>
                                            {t.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td>
                                        <button className="action-icon" onClick={() => handleDownloadTemplate(t._id, t.originalFileName)} title="Download"><FiDownload /></button>
                                        <button className="action-icon" onClick={() => openTemplateModal(t)} title="Edit"><FiEdit2 /></button>
                                        <button className="action-icon delete" onClick={() => handleDeleteTemplate(t._id)} title="Delete"><FiTrash2 /></button>
                                    </td>
                                </tr>
                            ))}
                            {templates.length === 0 && <tr><td colSpan="5" style={{textAlign:'center'}}>No templates found.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Category Modal */}
            {isCategoryModalOpen && (
                <div className="consent-modal-overlay">
                    <div className="consent-modal">
                        <div className="modal-header">
                            <h2>{editingCategory ? 'Edit Category' : 'Add Category'}</h2>
                            <button className="btn-close" onClick={() => setIsCategoryModalOpen(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleCategorySubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Category Name *</label>
                                    <input type="text" className="form-control" value={categoryForm.name} onChange={e => setCategoryForm({...categoryForm, name: e.target.value})} required />
                                </div>
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea className="form-control" rows="3" value={categoryForm.description} onChange={e => setCategoryForm({...categoryForm, description: e.target.value})}></textarea>
                                </div>
                                <div className="form-group">
                                    <label>Sort Order</label>
                                    <input type="number" className="form-control" value={categoryForm.sortOrder} onChange={e => setCategoryForm({...categoryForm, sortOrder: Number(e.target.value)})} />
                                </div>
                                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input type="checkbox" id="catActive" checked={categoryForm.isActive} onChange={e => setCategoryForm({...categoryForm, isActive: e.target.checked})} />
                                    <label htmlFor="catActive" style={{ margin: 0 }}>Active</label>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setIsCategoryModalOpen(false)}>Cancel</button>
                                <button type="submit" className="consent-btn-primary" disabled={isLoading}>{isLoading ? 'Saving...' : 'Save Category'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Template Modal */}
            {isTemplateModalOpen && (
                <div className="consent-modal-overlay">
                    <div className="consent-modal">
                        <div className="modal-header">
                            <h2>{editingTemplate ? 'Edit Template' : 'Add Template'}</h2>
                            <button className="btn-close" onClick={() => setIsTemplateModalOpen(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleTemplateSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Template Name *</label>
                                    <input type="text" className="form-control" value={templateForm.name} onChange={e => setTemplateForm({...templateForm, name: e.target.value})} required />
                                </div>
                                <div className="form-group">
                                    <label>Category *</label>
                                    <select className="form-control" value={templateForm.categoryId} onChange={e => setTemplateForm({...templateForm, categoryId: e.target.value})} required>
                                        <option value="">Select a category</option>
                                        {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea className="form-control" rows="2" value={templateForm.description} onChange={e => setTemplateForm({...templateForm, description: e.target.value})}></textarea>
                                </div>
                                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input type="checkbox" id="tmpActive" checked={templateForm.isActive} onChange={e => setTemplateForm({...templateForm, isActive: e.target.checked})} />
                                    <label htmlFor="tmpActive" style={{ margin: 0 }}>Active</label>
                                </div>
                                <div className="form-group">
                                    <label>Upload .docx File {editingTemplate ? '(Optional - will replace existing)' : '*'}</label>
                                    <div className="file-drop-area" onClick={() => document.getElementById('templateFile').click()}>
                                        <div className="file-icon"><FiUploadCloud /></div>
                                        <p>{templateForm.file ? templateForm.file.name : 'Click to select a .docx file'}</p>
                                        <input 
                                            type="file" 
                                            id="templateFile" 
                                            style={{ display: 'none' }} 
                                            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                                            onChange={e => {
                                                const file = e.target.files[0];
                                                if (file && file.name.endsWith('.docx')) {
                                                    setTemplateForm({...templateForm, file});
                                                } else {
                                                    alert('Please select a valid .docx file');
                                                    e.target.value = '';
                                                }
                                            }}
                                        />
                                    </div>
                                    <small style={{ color: '#64748b', marginTop: '8px', display: 'block' }}>
                                        Supported placeholders: {'{patient_name}, {age}, {gender}, {doctor_name}, {hospital_name}, {today}'}
                                    </small>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setIsTemplateModalOpen(false)}>Cancel</button>
                                <button type="submit" className="consent-btn-primary" disabled={isLoading}>{isLoading ? 'Saving...' : 'Save Template'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConsentManagement;
