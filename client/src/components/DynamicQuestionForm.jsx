import React from 'react';

const DynamicQuestionForm = ({ categoryName, questions, intakeData, setIntakeData, readOnly = false }) => {
    const handleAnswer = (q, val) => {
        if (readOnly) return;
        setIntakeData(prev => ({ ...prev, [q]: val }));
    };

    const handleCheckbox = (q, opt, isChecked) => {
        if (readOnly) return;
        setIntakeData(prev => {
            let current = prev[q] || [];
            if (!Array.isArray(current)) current = [];

            if (isChecked) {
                current = [...current, opt];
            } else {
                current = current.filter(i => i !== opt);
            }
            return { ...prev, [q]: current };
        });
    };

    const fieldStyle = {
        marginBottom: '18px',
        padding: '16px',
        background: '#fff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
    };

    const labelStyle = {
        fontWeight: '700',
        display: 'block',
        marginBottom: '10px',
        fontSize: '0.9rem',
        color: '#1e293b',
    };

    const inputStyle = {
        width: '100%',
        padding: '10px 14px',
        border: '2px solid #e2e8f0',
        borderRadius: '10px',
        fontSize: '0.9rem',
        fontFamily: 'inherit',
        color: '#1e293b',
        background: readOnly ? '#f8fafc' : '#fff',
        boxSizing: 'border-box',
        transition: 'border-color 0.2s',
        outline: 'none',
    };

    const checkboxCardStyle = (isChecked) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        border: `2px solid ${isChecked ? '#3b82f6' : '#e2e8f0'}`,
        borderRadius: '10px',
        background: isChecked ? '#eff6ff' : '#fafafa',
        cursor: readOnly ? 'default' : 'pointer',
        transition: 'all 0.2s',
        fontSize: '0.88rem',
        fontWeight: isChecked ? '600' : '400',
        color: isChecked ? '#1e40af' : '#334155',
        userSelect: 'none',
    });

    const checkboxInputStyle = {
        width: '18px',
        height: '18px',
        accentColor: '#3b82f6',
        cursor: readOnly ? 'default' : 'pointer',
        flexShrink: 0,
    };

    return (
        <div className="dpd-tab-panel">
            <h3 className="dpd-panel-title">📋 {categoryName}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {questions.map((item, idx) => {
                    // Logic check: only show if parent question condition is met
                    if (item.condition && intakeData[item.parentQ] !== item.condition) return null;

                    const savedVal = intakeData[item.q] || "";

                    return (
                        <div key={idx} style={fieldStyle}>
                            <label style={labelStyle}>{item.q}</label>

                            {/* Simple Input */}
                            {(item.type === 'text' || item.type === 'number' || item.type === 'date') && (
                                <input
                                    type={item.type}
                                    value={savedVal}
                                    onChange={(e) => handleAnswer(item.q, e.target.value)}
                                    disabled={readOnly}
                                    style={inputStyle}
                                />
                            )}

                            {/* Select */}
                            {item.type === 'select' && (
                                <select
                                    value={savedVal}
                                    onChange={(e) => handleAnswer(item.q, e.target.value)}
                                    disabled={readOnly}
                                    style={inputStyle}
                                >
                                    <option value="">Select...</option>
                                    {(item.options || []).map(o => (
                                        <option key={o} value={o}>{o}</option>
                                    ))}
                                </select>
                            )}

                            {/* Yes/No */}
                            {item.type === 'yes-no' && (
                                <select
                                    value={savedVal}
                                    onChange={(e) => handleAnswer(item.q, e.target.value)}
                                    disabled={readOnly}
                                    style={inputStyle}
                                >
                                    <option value="">Select...</option>
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                </select>
                            )}

                            {/* Textarea */}
                            {item.type === 'textarea' && (
                                <textarea
                                    value={savedVal}
                                    rows={4}
                                    onChange={(e) => handleAnswer(item.q, e.target.value)}
                                    disabled={readOnly}
                                    style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
                                />
                            )}

                            {/* Checkbox Group */}
                            {item.type === 'checkbox-group' && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                                    {(item.options || []).map(opt => {
                                        const isChecked = Array.isArray(intakeData[item.q]) && intakeData[item.q].includes(opt);
                                        return (
                                            <label key={opt} style={checkboxCardStyle(isChecked)}>
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    disabled={readOnly}
                                                    onChange={(e) => handleCheckbox(item.q, opt, e.target.checked)}
                                                    style={checkboxInputStyle}
                                                />
                                                <span>{opt}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Complex Checkbox Group (Date/Text) */}
                            {(item.type === 'checkbox-date-group' || item.type === 'checkbox-text-group') && (
                                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                                        {(item.options || []).map(opt => {
                                            const isChecked = Array.isArray(intakeData[item.q]) && intakeData[item.q].includes(opt);
                                            const dateVal = intakeData[`${item.q}_date_${opt}`] || "";

                                            return (
                                                <div key={opt} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <label style={checkboxCardStyle(isChecked)}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => handleCheckbox(item.q, opt, e.target.checked)}
                                                            style={checkboxInputStyle}
                                                        />
                                                        <span>{opt}</span>
                                                    </label>
                                                    {opt !== 'None' && isChecked && (
                                                        <input
                                                            type={item.type === 'checkbox-date-group' ? 'date' : 'text'}
                                                            value={dateVal}
                                                            onChange={(e) => handleAnswer(`${item.q}_date_${opt}`, e.target.value)}
                                                            placeholder={item.type === 'checkbox-text-group' ? 'Details...' : ''}
                                                            style={{ ...inputStyle, padding: '6px 10px', fontSize: '0.85rem' }}
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {item.extra && (
                                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', whiteSpace: 'nowrap' }}>{item.extra}:</span>
                                            <input
                                                type="text"
                                                value={intakeData[`${item.q}_extra`] || ""}
                                                onChange={(e) => handleAnswer(`${item.q}_extra`, e.target.value)}
                                                disabled={readOnly}
                                                placeholder="Enter details..."
                                                style={{ ...inputStyle, flex: 1 }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Row Type */}
                            {item.type === 'row' && (
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                    {(item.fields || []).map(field => {
                                        const val = intakeData[field.q] || "";
                                        return (
                                            <div key={field.q} style={{ flex: 1, minWidth: '150px' }}>
                                                <label style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: '6px', fontWeight: '600' }}>{field.q}</label>
                                                <input
                                                    type={field.type || 'text'}
                                                    value={val}
                                                    onChange={(e) => handleAnswer(field.q, e.target.value)}
                                                    disabled={readOnly}
                                                    style={inputStyle}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                        </div>
                    );
                })}
            </div>

        </div>
    );
};

export default DynamicQuestionForm;
