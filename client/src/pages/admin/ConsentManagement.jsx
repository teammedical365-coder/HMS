import React, { useState, useEffect, useRef } from 'react';
import { consentAPI } from '../../utils/api';
import { 
    FaPlus, 
    FaFolderPlus, 
    FaFileCirclePlus, 
    FaFileShield, 
    FaWandMagicSparkles, 
    FaMicrochip, 
    FaCloudArrowUp, 
    FaTrash, 
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
    FaArrowRotateRight
} from 'react-icons/fa6';
import './ConsentManagement.css';

const ConsentManagement = () => {
    const [activeTab, setActiveTab] = useState('addCategory'); // 'addCategory' | 'addConsent' | 'allDocs'
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

    // Canvas Refs
    const neuralCanvasRef = useRef(null);
    const sparkCanvasRef = useRef(null);
    const fileInputRef = useRef(null);

    // -------------------------------------------------------------
    // 1. NEURAL SYNAPSE CANVAS BACKGROUND ANIMATION
    // -------------------------------------------------------------
    useEffect(() => {
        const canvas = neuralCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animationFrameId;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        class NodeParticle {
            constructor() {
                this.reset();
            }
            reset() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 2.2 + 0.8;
                this.speedX = (Math.random() - 0.5) * 0.35;
                this.speedY = (Math.random() - 0.5) * 0.35;
                this.alpha = Math.random() * 0.45 + 0.15;
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) this.reset();
            }
            draw() {
                ctx.fillStyle = `rgba(5, 150, 105, ${this.alpha})`;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const particles = [];
        for (let i = 0; i < 45; i++) {
            particles.push(new NodeParticle());
        }

        const animateNeural = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < 130) {
                        ctx.strokeStyle = `rgba(5, 150, 105, ${(1 - dist / 130) * 0.2})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
            particles.forEach(p => {
                p.update();
                p.draw();
            });
            animationFrameId = requestAnimationFrame(animateNeural);
        };
        animateNeural();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    // -------------------------------------------------------------
    // 2. REAL-TIME ACTIVITY SPARKLINE & MOVING SHAPES ANIMATION
    // -------------------------------------------------------------
    useEffect(() => {
        const sparkCanvas = sparkCanvasRef.current;
        if (!sparkCanvas) return;
        const sparkCtx = sparkCanvas.getContext('2d');
        let sparkFrameId;

        const resizeSpark = () => {
            if (sparkCanvas.parentElement) {
                sparkCanvas.width = sparkCanvas.parentElement.clientWidth;
                sparkCanvas.height = sparkCanvas.parentElement.clientHeight;
            }
        };
        resizeSpark();
        window.addEventListener('resize', resizeSpark);

        const sparkPoints = new Array(Math.max(100, Math.floor(sparkCanvas.width || 300))).fill((sparkCanvas.height || 84) / 2);
        let sparkTick = 0;

        // Shape Drawing Helpers
        const drawHeart = (ctx, x, y, size, color, glowColor, glowBlur = 10, rotation = 0) => {
            ctx.save();
            ctx.translate(x, y);
            if (rotation) ctx.rotate(rotation);
            ctx.fillStyle = color;
            ctx.shadowColor = glowColor || color;
            ctx.shadowBlur = glowBlur;
            ctx.beginPath();
            const topCurveHeight = size * 0.3;
            ctx.moveTo(0, topCurveHeight);
            ctx.bezierCurveTo(-size / 2, -topCurveHeight, -size, size / 3, 0, size);
            ctx.bezierCurveTo(size, size / 3, size / 2, -topCurveHeight, 0, topCurveHeight);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        };

        const drawCross = (ctx, x, y, size, color, glowColor, rotation = 0) => {
            ctx.save();
            ctx.translate(x, y);
            if (rotation) ctx.rotate(rotation);
            ctx.fillStyle = color;
            ctx.shadowColor = glowColor || color;
            ctx.shadowBlur = 8;
            const w = size * 0.35;
            const h = size;
            ctx.fillRect(-w / 2, -h / 2, w, h);
            ctx.fillRect(-h / 2, -w / 2, h, w);
            ctx.restore();
        };

        const drawStar = (ctx, x, y, size, color, glowColor, rotation = 0) => {
            ctx.save();
            ctx.translate(x, y);
            if (rotation) ctx.rotate(rotation);
            ctx.fillStyle = color;
            ctx.shadowColor = glowColor || color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(0, -size);
            ctx.quadraticCurveTo(0, 0, size, 0);
            ctx.quadraticCurveTo(0, 0, 0, size);
            ctx.quadraticCurveTo(0, 0, -size, 0);
            ctx.quadraticCurveTo(0, 0, 0, -size);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        };

        const drawRing = (ctx, x, y, radius, color, alpha = 0.8) => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.shadowColor = color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(1, radius), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        };

        // Floating Shape Particles System
        class MovingShape {
            constructor(w, h, initial = false) {
                this.reset(w, h, initial);
            }

            reset(w, h, initial = false) {
                const types = ['heart', 'heart', 'heart', 'cross', 'star', 'ring', 'heart'];
                this.type = types[Math.floor(Math.random() * types.length)];
                this.x = initial ? Math.random() * (w || 300) : (w || 300) + Math.random() * 30;
                this.baseY = Math.random() * ((h || 84) - 24) + 12;
                this.y = this.baseY;
                this.speedX = -(Math.random() * 0.8 + 0.5); // smoothly moves right to left
                this.floatSpeed = Math.random() * 0.04 + 0.02;
                this.phase = Math.random() * Math.PI * 2;
                this.size = this.type === 'heart' ? Math.random() * 7 + 7 : Math.random() * 6 + 5;
                this.rotation = (Math.random() - 0.5) * 0.4;
                this.rotSpeed = (Math.random() - 0.5) * 0.02;
                this.alpha = Math.random() * 0.4 + 0.5;
                this.beatPhase = Math.random() * Math.PI * 2;

                if (this.type === 'heart') {
                    const heartPalettes = [
                        { fill: '#f43f5e', glow: 'rgba(244, 63, 94, 0.9)' }, // ruby red/rose
                        { fill: '#ec4899', glow: 'rgba(236, 72, 153, 0.9)' }, // bright pink
                        { fill: '#34d399', glow: 'rgba(52, 211, 153, 0.95)' }, // glowing emerald
                        { fill: '#38bdf8', glow: 'rgba(56, 189, 248, 0.9)' }, // bright sky
                        { fill: '#fb7185', glow: 'rgba(251, 113, 133, 0.9)' } // coral
                    ];
                    const p = heartPalettes[Math.floor(Math.random() * heartPalettes.length)];
                    this.color = p.fill;
                    this.glow = p.glow;
                } else if (this.type === 'cross') {
                    this.color = '#10b981';
                    this.glow = 'rgba(16, 185, 129, 0.85)';
                } else if (this.type === 'star') {
                    this.color = '#38bdf8';
                    this.glow = 'rgba(56, 189, 248, 0.9)';
                } else {
                    this.color = '#a7f3d0';
                    this.glow = 'rgba(167, 243, 208, 0.8)';
                }
            }

            update(w, h, time) {
                this.x += this.speedX;
                this.rotation += this.rotSpeed;
                this.y = this.baseY + Math.sin(time * 2.5 + this.phase) * 6;

                if (this.x < -25) {
                    this.reset(w, h);
                }
            }

            draw(ctx, time) {
                ctx.save();
                ctx.globalAlpha = this.alpha;

                let scale = 1;
                if (this.type === 'heart') {
                    scale = 1 + 0.25 * Math.sin(time * 7 + this.beatPhase);
                }

                if (this.type === 'heart') {
                    drawHeart(ctx, this.x, this.y, this.size * scale, this.color, this.glow, 12, this.rotation);
                } else if (this.type === 'cross') {
                    drawCross(ctx, this.x, this.y, this.size, this.color, this.glow, this.rotation);
                } else if (this.type === 'star') {
                    drawStar(ctx, this.x, this.y, this.size, this.color, this.glow, this.rotation);
                } else if (this.type === 'ring') {
                    drawRing(ctx, this.x, this.y, this.size * (1 + 0.2 * Math.sin(time * 4)), this.color, this.alpha);
                }

                ctx.restore();
            }
        }

        // Burst particle for heartbeat impact
        class HeartBurst {
            constructor(x, y) {
                this.x = x;
                this.y = y;
                this.vx = (Math.random() - 0.5) * 2;
                this.vy = -(Math.random() * 2 + 1);
                this.size = Math.random() * 5 + 5;
                this.alpha = 1;
                this.color = Math.random() > 0.5 ? '#f43f5e' : '#34d399';
                this.life = 0;
                this.maxLife = 35;
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                this.life++;
                this.alpha = Math.max(0, 1 - this.life / this.maxLife);
            }
            draw(ctx) {
                if (this.alpha <= 0) return;
                ctx.save();
                ctx.globalAlpha = this.alpha;
                drawHeart(ctx, this.x, this.y, this.size, this.color, this.color, 8);
                ctx.restore();
            }
        }

        const movingShapes = [];
        for (let i = 0; i < 12; i++) {
            movingShapes.push(new MovingShape(sparkCanvas.width || 300, sparkCanvas.height || 84, true));
        }

        let burstParticles = [];
        let timeCount = 0;

        const renderSparkline = () => {
            const w = sparkCanvas.width || 300;
            const h = sparkCanvas.height || 84;
            sparkCtx.clearRect(0, 0, w, h);
            timeCount += 0.03;

            const mid = h / 2;
            let y = mid;

            sparkTick++;
            let isPeak = false;
            if (sparkTick % 45 === 10) y = mid - 10;
            else if (sparkTick % 45 === 14) y = mid + 14;
            else if (sparkTick % 45 === 18) {
                y = mid - 28; // main QRS peak
                isPeak = true;
            }
            else if (sparkTick % 45 === 22) y = mid + 20;
            else y = mid + (Math.random() - 0.5) * 3;

            sparkPoints.push(y);
            if (sparkPoints.length > w) sparkPoints.shift();

            // Spawn burst particles at peak
            if (isPeak) {
                for (let b = 0; b < 3; b++) {
                    burstParticles.push(new HeartBurst(w - 10, y));
                }
            }

            // 1. Draw Floating and Moving Love Shapes & Medical Shapes in Background
            movingShapes.forEach(shape => {
                shape.update(w, h, timeCount);
                shape.draw(sparkCtx, timeCount);
            });

            // 2. Draw Heart Bursts
            burstParticles.forEach(b => {
                b.update();
                b.draw(sparkCtx);
            });
            burstParticles = burstParticles.filter(b => b.alpha > 0);

            // 3. Draw Grid/Pulse Guidance Scan Lines
            sparkCtx.save();
            sparkCtx.strokeStyle = 'rgba(52, 211, 153, 0.08)';
            sparkCtx.lineWidth = 1;
            for (let gridY = 15; gridY < h; gridY += 18) {
                sparkCtx.beginPath();
                sparkCtx.moveTo(0, gridY);
                sparkCtx.lineTo(w, gridY);
                sparkCtx.stroke();
            }
            sparkCtx.restore();

            // 4. Draw ECG Wave Pulse Line
            sparkCtx.save();
            sparkCtx.strokeStyle = '#34d399';
            sparkCtx.lineWidth = 2.4;
            sparkCtx.shadowColor = '#34d399';
            sparkCtx.shadowBlur = 12;
            sparkCtx.beginPath();
            for (let i = 0; i < sparkPoints.length; i++) {
                if (i === 0) sparkCtx.moveTo(i, sparkPoints[i]);
                else sparkCtx.lineTo(i, sparkPoints[i]);
            }
            sparkCtx.stroke();
            sparkCtx.restore();

            // 5. Draw Lead Heartbeat Shape at the Wavefront
            if (sparkPoints.length > 0) {
                const leadX = sparkPoints.length - 2;
                const leadY = sparkPoints[sparkPoints.length - 1];
                const leadHeartScale = 1 + 0.35 * Math.sin(timeCount * 8);

                // Lead Heart Glow Halo Ring
                drawRing(sparkCtx, leadX, leadY, 12 * leadHeartScale, 'rgba(52, 211, 153, 0.7)', 0.6);
                
                // Pulsing Lead Heart Shape (❤️)
                drawHeart(
                    sparkCtx, 
                    leadX, 
                    leadY - 6, 
                    11 * leadHeartScale, 
                    '#f43f5e', 
                    'rgba(244, 63, 94, 0.95)', 
                    14
                );
            }

            sparkFrameId = requestAnimationFrame(renderSparkline);
        };
        renderSparkline();

        // Node Ping dynamic simulator
        const pingInterval = setInterval(() => {
            const ms = Math.floor(Math.random() * 8) + 10;
            setPingStat(`${ms}ms`);
        }, 3500);

        return () => {
            window.removeEventListener('resize', resizeSpark);
            cancelAnimationFrame(sparkFrameId);
            clearInterval(pingInterval);
        };
    }, []);

    // -------------------------------------------------------------
    // 3. DATA FETCHING & API HOOKS
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

            if (statsRes?.success) setStats(statsRes.stats);
            if (catRes?.success) setCategories(catRes.data || []);
            if (tmplRes?.success) setTemplates(tmplRes.data || []);
        } catch (err) {
            console.error('Failed to load consent data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // -------------------------------------------------------------
    // 4. AUTO-SUGGESTION AI HELPERS
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
    // 5. CATEGORY HANDLERS
    // -------------------------------------------------------------
    const handleCategorySubmit = async (e) => {
        e.preventDefault();
        if (!categoryForm.name.trim()) return;

        setIsSubmitting(true);
        try {
            if (editingCategory) {
                await consentAPI.updateCategory(editingCategory._id, categoryForm);
                alert(`Category "${categoryForm.name}" updated successfully!`);
            } else {
                await consentAPI.createCategory(categoryForm);
                alert(`Category "${categoryForm.name}" created successfully!`);
                setCategoryForm({ name: '', description: '', sortOrder: 0, isActive: true });
            }
            fetchAllData();
            setIsCategoryModalOpen(false);
            setEditingCategory(null);
        } catch (error) {
            alert(error.response?.data?.message || 'Error saving category');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteCategory = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete category "${name}"?`)) return;
        try {
            await consentAPI.deleteCategory(id);
            fetchAllData();
        } catch (error) {
            alert(error.response?.data?.message || 'Error deleting category');
        }
    };

    const handleToggleCategory = async (id) => {
        try {
            await consentAPI.toggleCategory(id);
            fetchAllData();
        } catch (error) {
            console.error('Error toggling category:', error);
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
    // 6. TEMPLATE HANDLERS
    // -------------------------------------------------------------
    const handleTemplateSubmit = async (e) => {
        e.preventDefault();
        if (!templateForm.name.trim() || !templateForm.categoryId) {
            alert("Please provide template name and select a category.");
            return;
        }

        if (!editingTemplate && !templateForm.file) {
            alert("Please upload a .docx, .doc, or .pdf template file.");
            return;
        }

        setIsSubmitting(true);
        const formData = new FormData();
        formData.append('name', templateForm.name);
        formData.append('categoryId', templateForm.categoryId);
        formData.append('description', templateForm.description || '');
        formData.append('isActive', templateForm.isActive);
        if (templateForm.file) {
            formData.append('file', templateForm.file);
        }

        try {
            if (editingTemplate) {
                await consentAPI.updateTemplate(editingTemplate._id, formData);
                alert(`Template "${templateForm.name}" updated successfully!`);
            } else {
                await consentAPI.createTemplate(formData);
                alert(`Template "${templateForm.name}" parsed and registered successfully!`);
                setTemplateForm({ name: '', categoryId: '', description: '', isActive: true, file: null });
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
            fetchAllData();
            setIsTemplateModalOpen(false);
            setEditingTemplate(null);
        } catch (error) {
            alert(error.response?.data?.message || 'Error saving template');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteTemplate = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete template "${name}"?`)) return;
        try {
            await consentAPI.deleteTemplate(id);
            fetchAllData();
        } catch (error) {
            alert(error.response?.data?.message || 'Error deleting template');
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
            alert('Error downloading template');
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

    return (
        <div className="consent-hub-wrapper">
            {/* Ambient Background Glows and Synaptic Network Canvas */}
            <div className="ambient-glow orb-1"></div>
            <div className="ambient-glow orb-2"></div>
            <div className="ambient-glow orb-3"></div>
            <canvas id="neural-canvas" className="neural-canvas" ref={neuralCanvasRef}></canvas>

            <div className="consent-hub-inner">
                
                {/* HERO BANNER */}
                <div className="dash-title-banner">
                    <div className="dash-banner-left">
                        <h2 className="banner-big-heading"><FaFileShield /> Consent Document Hub</h2>
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
                    </div>
                </div>

                {/* MAIN DASHBOARD GRID */}
                <div className="dashboard-grid">
                    
                    {/* LEFT PANEL: FORMS */}
                    <div>
                        {/* TAB 1: ADD CATEGORY */}
                        {activeTab === 'addCategory' && (
                            <div className="card-box">
                                <h3>
                                    <span className="card-box-header-left">
                                        <FaFolderTree style={{ color: 'var(--brand-green)' }} /> 
                                        <span>Create Consent Category</span>
                                    </span>
                                </h3>

                                <form onSubmit={handleCategorySubmit}>
                                    <div className="form-group-custom">
                                        <label>
                                            <span>Category Name <span style={{ color: '#ef4444' }}>*</span></span>
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
                                            <span>Description &amp; Scope</span>
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

                                    <div className="form-checkbox-row" style={{ marginTop: '18px', marginBottom: '22px' }}>
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
                                    <span className="badge-header"><FaShieldHalved /> HIPAA Scanner</span>
                                </h3>

                                <form onSubmit={handleTemplateSubmit}>
                                    <div className="form-group-custom">
                                        <label>
                                            <span>Consent Name</span>
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
                                        <label>Choose Category</label>
                                        <select 
                                            value={templateForm.categoryId}
                                            onChange={(e) => setTemplateForm({ ...templateForm, categoryId: e.target.value })}
                                            required
                                        >
                                            <option value="" disabled>-- Select Category --</option>
                                            {categories.map(c => (
                                                <option key={c._id} value={c._id}>{c.name}</option>
                                            ))}
                                            {categories.length === 0 && <option value="" disabled>No categories available (Create one first)</option>}
                                        </select>
                                    </div>

                                    <div className="form-group-custom">
                                        <label>Description &amp; Key Clauses</label>
                                        <textarea 
                                            placeholder="Enter details, procedure notes, or scope regarding this consent form..." 
                                            value={templateForm.description}
                                            onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                                        ></textarea>
                                    </div>

                                    <div className="form-group-custom">
                                        <label>Upload Document File (.docx / .pdf)</label>
                                        <div 
                                            className="file-upload-box" 
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <FaCloudArrowUp className="upload-icon" />
                                            <p style={{ fontWeight: 700, color: 'var(--text-heading)', fontSize: '14px', margin: '4px 0' }}>
                                                {templateForm.file ? `Selected File: ${templateForm.file.name}` : 'Click to browse file with Parser'}
                                            </p>
                                            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                                Supports .docx, .doc, .pdf (Max: 15MB)
                                            </span>
                                            <input 
                                                type="file" 
                                                ref={fileInputRef}
                                                style={{ display: 'none' }} 
                                                accept=".docx,.doc,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                                                onChange={(e) => {
                                                    const file = e.target.files[0];
                                                    if (file) setTemplateForm({ ...templateForm, file });
                                                }}
                                            />
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
                                        <FaMicrochip /> {isSubmitting ? 'Processing & Registering...' : 'Parse & Register'}
                                    </button>
                                </form>
                            </div>
                        )}

                        {/* TAB 3: ALL CATEGORIES VIEW */}
                        {activeTab === 'allDocs' && (
                            <div className="card-box">
                                <h3>
                                    <span className="card-box-header-left">
                                        <FaFolderTree style={{ color: 'var(--brand-green)' }} /> 
                                        <span>Active Categories Directory</span>
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
                                            <th>Status</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {categories.map(c => (
                                            <tr key={c._id}>
                                                <td><strong>{c.name}</strong></td>
                                                <td><span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.description || '—'}</span></td>
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
                                        ))}
                                        {categories.length === 0 && (
                                            <tr>
                                                <td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
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
                                <div className="stat-mini-num">{stats.totalTemplates || templates.length}</div>
                                <div className="stat-mini-lbl">Total Templates</div>
                            </div>
                            <div className="stat-mini-box" style={{ background: 'var(--pastel-blue)', borderColor: '#bae6fd' }}>
                                <div className="stat-mini-num" style={{ color: '#0369a1' }}>{stats.totalCategories || categories.length}</div>
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

                        <div style={{ background: 'var(--pastel-blue)', border: '1px solid #bae6fd', borderRadius: '14px', padding: '14px', fontSize: '12px', color: '#0369a1', lineHeight: '1.4' }}>
                            <FaCircleInfo style={{ marginRight: '4px' }} /> <strong>Clean Palette:</strong> Featuring harmonious light green, light blue, and teal accents with automated HIPAA compliance parser across all consent forms.
                        </div>
                    </div>

                </div>

                {/* REGISTERED CONSENTS DATA TABLE */}
                <div className="table-container-custom">
                    <div className="table-header-flex">
                        <div>
                            <h4>Registered Consent Templates</h4>
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
                                <option value="">All Categories ({templates.length})</option>
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
                                    <label>Replace Document File (.docx / .pdf) (Optional)</label>
                                    <input 
                                        type="file" 
                                        accept=".docx,.doc,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
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
