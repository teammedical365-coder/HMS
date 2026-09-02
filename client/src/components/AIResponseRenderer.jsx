import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FiCopy, FiCheck, FiInfo, FiAlertTriangle, FiFileText, FiActivity, FiTrendingUp, FiThumbsUp, FiThumbsDown } from 'react-icons/fi';
import './AIResponseRenderer.css';

/**
 * AIResponseRenderer
 * Professional, Colorful Markdown & Structured Medical AI Response Component.
 * Supports headings, colored tables, bullets, metric badges, reactions, copy button, and safety tags.
 */
const AIResponseRenderer = ({ 
    content = '', 
    timestamp = '', 
    role = 'ai',
    isTyping = false 
}) => {
    const [copied, setCopied] = useState(false);
    const [reaction, setReaction] = useState(null); // 'like' | 'dislike' | null

    const handleCopy = (e) => {
        e.stopPropagation();
        if (!content) return;
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (role === 'doctor' || role === 'user') {
        return (
            <div className="cca-msg-row doctor">
                <div className="cca-msg-bubble doctor">
                    <div className="cca-msg-text">{content}</div>
                    <div className="cca-msg-time-row">
                        <span>{timestamp}</span>
                        <span className="cca-msg-check">✓✓</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="cca-msg-row ai">
            <div className="cca-msg-avatar-robot">
                <span>🤖</span>
            </div>
            <div className="cca-msg-bubble ai">
                {/* Header Badge */}
                <div className="ai-response-header">
                    <div className="ai-brand-tag">
                        <span className="ai-brand-dot"></span>
                        <span className="ai-brand-name">Medical365 AI</span>
                        <span className="ai-brand-sub">Clinical Intelligence</span>
                    </div>
                    <button 
                        className={`ai-btn-copy ${copied ? 'copied' : ''}`} 
                        onClick={handleCopy}
                        title="Copy response"
                    >
                        {copied ? (
                            <>
                                <FiCheck size={12} />
                                <span>Copied</span>
                            </>
                        ) : (
                            <>
                                <FiCopy size={12} />
                                <span>Copy</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Markdown Rendered Content */}
                <div className="ai-markdown-body" data-lenis-prevent>
                    {isTyping ? (
                        <div className="ai-typing-indicator">
                            <span className="ai-typing-label">Analyzing clinical report, imaging & medical parameters...</span>
                            <div className="cca-typing-dots">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    ) : (
                        <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                                table: ({ node, ...props }) => (
                                    <div className="ai-markdown-table-wrapper" data-lenis-prevent>
                                        <table className="ai-markdown-table" {...props} />
                                    </div>
                                ),
                                th: ({ node, ...props }) => <th className="ai-table-th" {...props} />,
                                td: ({ node, ...props }) => <td className="ai-table-td" {...props} />,
                                h1: ({ node, ...props }) => <h3 className="ai-md-h1" {...props} />,
                                h2: ({ node, ...props }) => <h4 className="ai-md-h2" {...props} />,
                                h3: ({ node, ...props }) => <h5 className="ai-md-h3" {...props} />,
                                ul: ({ node, ...props }) => <ul className="ai-md-ul" {...props} />,
                                ol: ({ node, ...props }) => <ol className="ai-md-ol" {...props} />,
                                li: ({ node, ...props }) => <li className="ai-md-li" {...props} />,
                                blockquote: ({ node, ...props }) => <blockquote className="ai-md-blockquote" {...props} />,
                                code: ({ node, inline, ...props }) => (
                                    inline ? <code className="ai-md-inline-code" {...props} /> : <code className="ai-md-block-code" {...props} />
                                ),
                                hr: ({ node, ...props }) => <hr className="ai-md-hr" {...props} />
                            }}
                        >
                            {content}
                        </ReactMarkdown>
                    )}
                </div>

                {/* Footer Reactions & Timestamp */}
                {!isTyping && (
                    <div className="cca-msg-footer-row">
                        <div className="ai-reactions-group">
                            <button 
                                className={`ai-btn-reaction ${reaction === 'like' ? 'active' : ''}`}
                                onClick={() => setReaction(reaction === 'like' ? null : 'like')}
                                title="Helpful analysis"
                            >
                                <FiThumbsUp size={12} />
                            </button>
                            <button 
                                className={`ai-btn-reaction ${reaction === 'dislike' ? 'active' : ''}`}
                                onClick={() => setReaction(reaction === 'dislike' ? null : 'dislike')}
                                title="Needs refinement"
                            >
                                <FiThumbsDown size={12} />
                            </button>
                        </div>
                        <span className="ai-time-label">{timestamp}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIResponseRenderer;
