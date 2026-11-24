import React from 'react';
import LabHeader from './LabHeader';
import './LabLayout.css';

const LabLayout = ({ title, subtitle, children }) => {
    return (
        <div className="lab-layout-wrapper">
            <div className="lab-main-area">
                <LabHeader
                    title={title}
                    subtitle={subtitle}
                />
                <main className="lab-content">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default LabLayout;
