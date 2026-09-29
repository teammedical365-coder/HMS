/**
 * Global Modal Scroll Lock Manager for Medical365
 * Automatically detects any modal/popup overlay in the DOM across all Admin and App pages.
 * - Freezes background scrolling on html, body, and admin layouts.
 * - Pauses Lenis smooth scrolling so wheel events cannot move the background.
 * - Isolates scrolling strictly inside the active popup/modal.
 */

const MODAL_SELECTORS = [
  '[class*="modal-overlay"]',
  '[class*="modal-backdrop"]',
  '[class*="-modal-overlay"]',
  '[class*="-modal-backdrop"]',
  '.pkg-modal-overlay',
  '.vm-modal-backdrop',
  '.ha-bed-modal-overlay',
  '.acc-modal-overlay',
  '.ql-modal-overlay',
  '.ipd-modal-backdrop',
  '.ha-modal-backdrop',
  '.modal-overlay',
  '.modal-backdrop',
  '.modal',
  '[role="dialog"]',
  '[aria-modal="true"]'
].join(', ');

const EXCLUDED_SELECTORS = [
  '.sidebar-overlay',
  '.card-overlay',
  '.image-overlay',
  '.doctor-overlay',
  '.avatar-upload-overlay',
  '.med-bg-overlay'
].join(', ');

let isLocked = false;

export const hasActiveModal = () => {
  if (typeof document === 'undefined') return false;
  const candidates = document.querySelectorAll(MODAL_SELECTORS);
  for (const el of candidates) {
    if (el.matches(EXCLUDED_SELECTORS)) continue;
    
    // Make sure element is attached and visible
    const style = window.getComputedStyle(el);
    if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
      return true;
    }
  }
  return false;
};

export const updateModalScrollLock = () => {
  if (typeof document === 'undefined') return;
  const active = hasActiveModal();

  if (active && !isLocked) {
    isLocked = true;
    
    // Pause Lenis smooth scrolling if running
    if (window.__lenis && typeof window.__lenis.stop === 'function') {
      window.__lenis.stop();
    }
    
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
  } else if (!active && isLocked) {
    isLocked = false;
    
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    
    // Resume Lenis smooth scrolling
    if (window.__lenis && typeof window.__lenis.start === 'function') {
      window.__lenis.start();
    }
  }
};

/**
 * Initializes global mutation observer and event listeners
 */
export const initModalScrollLock = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  // 1. Observe DOM for modal mounts/unmounts
  const observer = new MutationObserver(() => {
    updateModalScrollLock();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden']
  });

  // 2. Intercept wheel events on the backdrop
  const handleWheel = (e) => {
    if (!isLocked) return;

    // Check if target is inside an inner scrollable element (e.g. dropdown, textarea, table)
    const innerScrollable = e.target.closest(
      '.custom-select-dropdown, .custom-select-container, select, textarea, [data-scrollable="true"]'
    );
    if (innerScrollable) {
      // Allow inner scrollable elements to scroll freely with mouse wheel
      return;
    }

    // Check if target is inside a scrollable modal container
    const scrollableModal = e.target.closest(
      '.pkg-modal-body, .pkg-modal, .vm-modal-body, .vm-modal, .ha-bed-modal-box, .modal-body, .modal-content, .ipd-modal-box, .acc-modal-body, .acc-modal, .ql-modal-body, .ql-modal-content, [role="dialog"], [data-scrollable="true"]'
    );

    // If mouse is directly on the blurred backdrop or non-scrollable area outside modal, stop scroll completely
    if (!scrollableModal) {
      e.preventDefault();
      return;
    }

    // Inside scrollable modal: prevent scroll chaining when reaching boundaries
    const { scrollTop, scrollHeight, clientHeight } = scrollableModal;
    const isScrollingUp = e.deltaY < 0;
    const isScrollingDown = e.deltaY > 0;

    if (scrollHeight > clientHeight) {
      const isAtTop = scrollTop <= 0;
      const isAtBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight;

      if ((isScrollingUp && isAtTop) || (isScrollingDown && isAtBottom)) {
        // Prevent event from bubbling to background window
        e.preventDefault();
      }
    } else {
      // Content doesn't need scrolling, lock wheel
      e.preventDefault();
    }
  };

  // 3. Intercept touchmove events on backdrop for mobile devices
  const handleTouchMove = (e) => {
    if (!isLocked) return;
    const innerScrollable = e.target.closest(
      '.custom-select-dropdown, .custom-select-container, select, textarea, [data-scrollable="true"]'
    );
    if (innerScrollable) return;

    const scrollableModal = e.target.closest(
      '.pkg-modal-body, .vm-modal-body, .ha-bed-modal-box, .modal-body, .modal-content, .ipd-modal-box, .acc-modal-body, .ql-modal-body, [role="dialog"]'
    );
    if (!scrollableModal) {
      e.preventDefault();
    }
  };

  window.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('touchmove', handleTouchMove, { passive: false });

  // Initial check on load
  updateModalScrollLock();

  return () => {
    observer.disconnect();
    window.removeEventListener('wheel', handleWheel);
    window.removeEventListener('touchmove', handleTouchMove);
  };
};

export default initModalScrollLock;
