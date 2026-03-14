import React from 'react';

const DynamicQuestionForm = ({ categoryName, questions, intakeData, setIntakeData }) => {
    const handleAnswer = (q, val) => {
        setIntakeData(prev => ({ ...prev, [q]: val }));
    };

    const handleCheckbox = (q, opt, isChecked) => {
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

    return (
        <div className="dpd-tab-panel">
            <h3 className="dpd-panel-title">📋 {categoryName}</h3>

            <div className="dynamic-form-container">
                {questions.map((item, idx) => {
                    // Logic check: only show if parent question condition is met
                    if (item.condition && intakeData[item.parentQ] !== item.condition) return null;

                    const savedVal = intakeData[item.q] || "";

                    return (
                        <div key={idx} className="dpd-field-full" style={{ marginBottom: '15px' }}>
                            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>{item.q}</label>

                            {/* Simple Input */}
                            {(item.type === 'text' || item.type === 'number' || item.type === 'date') && (
                                <input
                                    type={item.type}
                                    value={savedVal}
                                    onChange={(e) => handleAnswer(item.q, e.target.value)}
                                    style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                />
                            )}

                            {/* Select */}
                            {item.type === 'select' && (
                                <select
                                    value={savedVal}
                                    onChange={(e) => handleAnswer(item.q, e.target.value)}
                                    style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
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
                                    style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
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
                                    style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', resize: 'vertical' }}
                                />
                            )}

                            {/* Checkbox Group */}
                            {item.type === 'checkbox-group' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {(item.options || []).map(opt => {
                                        const isChecked = (intakeData[item.q] || []).includes(opt);
                                        return (
                                            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={(e) => handleCheckbox(item.q, opt, e.target.checked)}
                                                /> {opt}
                                            </label>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Complex Checkbox Group (Date/Text) */}
                            {(item.type === 'checkbox-date-group' || item.type === 'checkbox-text-group') && (
                                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                    {(item.options || []).map(opt => {
                                        const isChecked = (intakeData[item.q] || []).includes(opt);
                                        const dateVal = intakeData[`${item.q}_date_${opt}`] || "";

                                        return (
                                            <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={(e) => handleCheckbox(item.q, opt, e.target.checked)}
                                                    /> {opt}
                                                </label>
                                                {opt !== 'None' && isChecked && (
                                                    <input
                                                        type={item.type === 'checkbox-date-group' ? 'date' : 'text'}
                                                        value={dateVal}
                                                        onChange={(e) => handleAnswer(`${item.q}_date_${opt}`, e.target.value)}
                                                        placeholder={item.type === 'checkbox-text-group' ? 'Details...' : ''}
                                                        style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                    {item.extra && (
                                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ fontSize: '13px', color: '#64748b' }}>{item.extra}:</span>
                                            <input
                                                type="text"
                                                value={intakeData[`${item.q}_extra`] || ""}
                                                onChange={(e) => handleAnswer(`${item.q}_extra`, e.target.value)}
                                                placeholder="Enter details..."
                                                style={{ flex: 1, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Row Type */}
                            {item.type === 'row' && (
                                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                    {(item.fields || []).map(field => {
                                        const val = intakeData[field.q] || "";
                                        return (
                                            <div key={field.q} style={{ flex: 1, minWidth: '150px' }}>
                                                <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>{field.q}</label>
                                                <input
                                                    type={field.type || 'text'}
                                                    value={val}
                                                    onChange={(e) => handleAnswer(field.q, e.target.value)}
                                                    style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
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
