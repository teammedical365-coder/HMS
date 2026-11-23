import React, { useState } from 'react';
import LabSidebar from './LabSidebar';
import LabHeader from './LabHeader';
import './LabLayout.css';

const LabLayout = ({ title, subtitle, children }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="lab-layout-wrapper">
            <LabSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <div className="lab-main-area">
                <LabHeader
                    title={title}
                    subtitle={subtitle}
                    onToggleSidebar={() => setSidebarOpen(prev => !prev)}
                />
                <main className="lab-content">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default LabLayout;
