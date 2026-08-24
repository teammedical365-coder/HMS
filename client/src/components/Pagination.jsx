import React from 'react';
import './Pagination.css';

/**
 * Premium Animated Pagination Component for Medical365 HMS
 * 
 * @param {Object} props
 * @param {number} props.currentPage - Current active page (1-indexed)
 * @param {number} props.totalPages - Total number of pages
 * @param {number} props.totalRecords - Total count of records
 * @param {number} props.pageSize - Number of items per page (default: 10)
 * @param {Function} props.onPageChange - Callback when a page is clicked
 * @param {string} props.entityName - Name of the items being paginated (default: "staff")
 * @param {boolean} props.isLoading - Optional loading flag
 */
const Pagination = ({
    currentPage = 1,
    totalPages = 1,
    totalRecords = 0,
    pageSize = 10,
    onPageChange,
    entityName = 'staff',
    isLoading = false,
    className = ''
}) => {
    if (totalRecords === 0) {
        return null;
    }

    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalRecords);

    // Intelligent Page Range Calculation
    const getPageNumbers = () => {
        const total = Math.max(1, totalPages);
        const current = Math.min(Math.max(1, currentPage), total);

        if (total <= 7) {
            return Array.from({ length: total }, (_, i) => i + 1);
        }

        const leftSiblingIndex = Math.max(current - 1, 1);
        const rightSiblingIndex = Math.min(current + 1, total);

        const shouldShowLeftDots = leftSiblingIndex > 2;
        const shouldShowRightDots = rightSiblingIndex < total - 2;

        // Case 1: No left dots to show, but right dots to be shown
        if (!shouldShowLeftDots && shouldShowRightDots) {
            const leftItemCount = 5;
            const leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
            return [...leftRange, '...', total];
        }

        // Case 2: No right dots to show, but left dots to be shown
        if (shouldShowLeftDots && !shouldShowRightDots) {
            const rightItemCount = 5;
            const rightRange = Array.from(
                { length: rightItemCount },
                (_, i) => total - rightItemCount + i + 1
            );
            return [1, '...', ...rightRange];
        }

        // Case 3: Both left and right dots to be shown
        if (shouldShowLeftDots && shouldShowRightDots) {
            const middleRange = [leftSiblingIndex, current, rightSiblingIndex];
            return [1, '...', ...middleRange, '...', total];
        }

        return Array.from({ length: total }, (_, i) => i + 1);
    };

    const pages = getPageNumbers();

    const handlePageClick = (page) => {
        if (typeof page === 'number' && page !== currentPage && page >= 1 && page <= totalPages && !isLoading) {
            onPageChange(page);
        }
    };

    const handlePrev = () => {
        if (currentPage > 1 && !isLoading) {
            onPageChange(currentPage - 1);
        }
    };

    const handleNext = () => {
        if (currentPage < totalPages && !isLoading) {
            onPageChange(currentPage + 1);
        }
    };

    const isFirstPage = currentPage <= 1;
    const isLastPage = currentPage >= totalPages;

    return (
        <nav 
            className={`med365-pagination-wrapper ${className}`} 
            aria-label={`${entityName} table pagination`}
        >
            {/* Left Section: Showing Info */}
            <div className="med365-pagination-info">
                <span className="info-text">
                    Showing <strong className="info-highlight">{start}–{end}</strong> of{' '}
                    <strong className="info-highlight">{totalRecords}</strong> {entityName}
                </span>
            </div>

            {/* Right Section: Pagination Controls */}
            <div className="med365-pagination-controls">
                {/* Previous Button */}
                <button
                    type="button"
                    className={`med365-page-nav-btn prev-btn ${isFirstPage ? 'disabled' : ''}`}
                    onClick={handlePrev}
                    disabled={isFirstPage || isLoading}
                    aria-label="Previous page"
                >
                    <span className="nav-arrow prev-arrow">←</span>
                    <span className="nav-label">Previous</span>
                </button>

                {/* Mobile Compact Indicator */}
                <div className="med365-page-mobile-indicator">
                    <span>Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong></span>
                </div>

                {/* Desktop Page Numbers */}
                <div className="med365-page-numbers">
                    {pages.map((item, idx) => {
                        if (item === '...') {
                            return (
                                <span 
                                    key={`dots-${idx}`} 
                                    className="med365-page-ellipsis" 
                                    aria-hidden="true"
                                >
                                    …
                                </span>
                            );
                        }

                        const pageNum = Number(item);
                        const isActive = pageNum === currentPage;

                        return (
                            <button
                                key={`page-${pageNum}`}
                                type="button"
                                className={`med365-page-btn ${isActive ? 'active' : ''}`}
                                onClick={() => handlePageClick(pageNum)}
                                disabled={isLoading}
                                aria-label={`Page ${pageNum}`}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                {pageNum}
                            </button>
                        );
                    })}
                </div>

                {/* Next Button */}
                <button
                    type="button"
                    className={`med365-page-nav-btn next-btn ${isLastPage ? 'disabled' : ''}`}
                    onClick={handleNext}
                    disabled={isLastPage || isLoading}
                    aria-label="Next page"
                >
                    <span className="nav-label">Next</span>
                    <span className="nav-arrow next-arrow">→</span>
                </button>
            </div>
        </nav>
    );
};

export default Pagination;
