import React from 'react';
import './LabLayout.css';

const LabLayout = ({ children }) => {
    return (
        <div className="lab-layout-wrapper">
            <div className="lab-main-area">
                <main className="lab-content">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default LabLayout;
