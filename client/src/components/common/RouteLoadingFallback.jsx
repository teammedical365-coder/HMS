import React from 'react';
import './RouteLoadingFallback.css';

/**
 * Premium Route Loading Fallback for Medical365 HMS
 * 
 * Provides an instant branded loading shimmer and lightweight skeleton structure
 * to prevent layout jumps and white screen flashing during chunk downloads.
 */
const RouteLoadingFallback = () => {
    return (
        <div className="med365-route-loader-container" aria-busy="true" aria-label="Loading page">
            {/* Top progress bar shimmer */}
            <div className="med365-top-shimmer-bar"></div>

            {/* Content Skeleton Placeholder */}
            <div className="med365-route-skeleton-body">
                {/* Header Skeleton */}
                <div className="med365-skel-header">
                    <div className="med365-skel-line med365-skel-title"></div>
                    <div className="med365-skel-line med365-skel-subtitle"></div>
                </div>

                {/* Metric Cards Skeleton */}
                <div className="med365-skel-grid">
                    <div className="med365-skel-card">
                        <div className="med365-skel-line skel-w40"></div>
                        <div className="med365-skel-line skel-w70 skel-h28"></div>
                    </div>
                    <div className="med365-skel-card">
                        <div className="med365-skel-line skel-w40"></div>
                        <div className="med365-skel-line skel-w70 skel-h28"></div>
                    </div>
                    <div className="med365-skel-card">
                        <div className="med365-skel-line skel-w40"></div>
                        <div className="med365-skel-line skel-w70 skel-h28"></div>
                    </div>
                </div>

                {/* Table / Content Area Skeleton */}
                <div className="med365-skel-table-box">
                    <div className="med365-skel-table-row skel-header-row">
                        <div className="med365-skel-line skel-w30"></div>
                        <div className="med365-skel-line skel-w20"></div>
                        <div className="med365-skel-line skel-w20"></div>
                    </div>
                    <div className="med365-skel-table-row">
                        <div className="med365-skel-line skel-w60"></div>
                        <div className="med365-skel-line skel-w20"></div>
                        <div className="med365-skel-line skel-w10"></div>
                    </div>
                    <div className="med365-skel-table-row">
                        <div className="med365-skel-line skel-w50"></div>
                        <div className="med365-skel-line skel-w30"></div>
                        <div className="med365-skel-line skel-w10"></div>
                    </div>
                    <div className="med365-skel-table-row">
                        <div className="med365-skel-line skel-w70"></div>
                        <div className="med365-skel-line skel-w20"></div>
                        <div className="med365-skel-line skel-w10"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RouteLoadingFallback;
