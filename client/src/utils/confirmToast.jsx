import React, { useState, useEffect, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { FaTriangleExclamation, FaTrash, FaCheck, FaPenToSquare, FaXmark } from 'react-icons/fa6';

export { toast, Toaster };

/**
 * Global reactive modal state for confirm and prompt dialogs
 */
let currentModalState = null;
const modalListeners = new Set();

const notifyModalListeners = () => {
  modalListeners.forEach((listener) => listener(currentModalState));
};

/**
 * Premium Confirmation Modal (replaces browser confirm and hot-toast confirm)
 * Features: Full-screen dimmed & blurred backdrop, focused modal card, keyboard shortcuts (Esc/Enter),
 * and complete scroll locking of the background page.
 *
 * Usage:
 *   if (!(await confirmToast('Are you sure you want to delete this category?', { title: 'Delete Category' }))) return;
 */
export const confirmToast = (message, options = {}) => {
  return new Promise((resolve) => {
    const onConfirmCb = typeof options === 'function' ? options : options.onConfirm;
    const confirmLabel = (typeof options === 'object' && options.confirmText) || 'Delete';
    const cancelLabel = (typeof options === 'object' && options.cancelText) || 'Cancel';
    const isDanger = typeof options === 'object' && options.danger !== undefined ? options.danger : true;
    const title = (typeof options === 'object' && options.title) || (isDanger ? 'Confirm Deletion' : 'Please Confirm');

    const handleConfirm = () => {
      currentModalState = null;
      notifyModalListeners();
      if (onConfirmCb) onConfirmCb();
      resolve(true);
    };

    const handleCancel = () => {
      currentModalState = null;
      notifyModalListeners();
      if (typeof options === 'object' && options.onCancel) options.onCancel();
      resolve(false);
    };

    currentModalState = {
      id: Date.now() + Math.random().toString(36).substring(2, 7),
      type: 'confirm',
      title,
      message,
      confirmLabel,
      cancelLabel,
      isDanger,
      onConfirm: handleConfirm,
      onCancel: handleCancel,
    };

    notifyModalListeners();
  });
};

/**
 * Premium Prompt Modal (replaces window.prompt)
 *
 * Usage:
 *   const newName = await promptToast('Enter new category name:', { defaultValue: oldName, title: 'Rename Category' });
 *   if (!newName) return;
 */
export const promptToast = (message, defaultValOrOptions = {}, maybeOptions = {}) => {
  return new Promise((resolve) => {
    let options = {};
    let defaultValue = '';

    if (typeof defaultValOrOptions === 'string') {
      defaultValue = defaultValOrOptions;
      options = maybeOptions || {};
    } else if (typeof defaultValOrOptions === 'object') {
      options = defaultValOrOptions || {};
      defaultValue = options.defaultValue || '';
    }

    const title = options.title || 'Edit Information';
    const placeholder = options.placeholder || 'Type here...';
    const confirmLabel = options.confirmText || 'Save';
    const cancelLabel = options.cancelText || 'Cancel';

    const handleConfirm = (value) => {
      currentModalState = null;
      notifyModalListeners();
      resolve(value);
    };

    const handleCancel = () => {
      currentModalState = null;
      notifyModalListeners();
      resolve(null);
    };

    currentModalState = {
      id: Date.now() + Math.random().toString(36).substring(2, 7),
      type: 'prompt',
      title,
      message,
      defaultValue,
      placeholder,
      confirmLabel,
      cancelLabel,
      onConfirm: handleConfirm,
      onCancel: handleCancel,
    };

    notifyModalListeners();
  });
};

/**
 * Host component that renders the premium modal overlay in App root
 */
export const ConfirmModalHost = () => {
  const [modal, setModal] = useState(currentModalState);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const handleUpdate = (state) => {
      setModal(state);
      if (state && state.type === 'prompt') {
        setInputValue(state.defaultValue || '');
      }
    };
    modalListeners.add(handleUpdate);
    return () => modalListeners.delete(handleUpdate);
  }, []);

  useEffect(() => {
    if (!modal) return;

    if (modal.type === 'prompt' && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 60);
      return () => clearTimeout(timer);
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        modal.onCancel();
      } else if (e.key === 'Enter' && modal.type !== 'prompt') {
        e.preventDefault();
        modal.onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modal]);

  if (!modal) return null;

  const isDelete =
    modal.isDanger &&
    (modal.confirmLabel?.toLowerCase().includes('delete') ||
      modal.title?.toLowerCase().includes('delete') ||
      modal.message?.toLowerCase().includes('delete'));

  return (
    <div
      className="confirm-modal-overlay modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={modal.onCancel}
    >
      <div
        className="confirm-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="confirm-modal-close-btn"
          onClick={modal.onCancel}
          title="Close (Esc)"
        >
          <FaXmark />
        </button>

        <div className="confirm-modal-header">
          <div
            className={`confirm-modal-icon-wrap ${
              modal.type === 'prompt' ? 'prompt' : modal.isDanger ? 'danger' : 'success'
            }`}
          >
            {modal.type === 'prompt' ? (
              <FaPenToSquare />
            ) : isDelete ? (
              <FaTrash />
            ) : modal.isDanger ? (
              <FaTriangleExclamation />
            ) : (
              <FaCheck />
            )}
          </div>
          <div className="confirm-modal-content">
            <h3 className="confirm-modal-title">{modal.title}</h3>
            {modal.message && <p className="confirm-modal-message">{modal.message}</p>}
          </div>
        </div>

        {modal.type === 'prompt' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              modal.onConfirm(inputValue);
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              placeholder={modal.placeholder}
              onChange={(e) => setInputValue(e.target.value)}
              className="confirm-modal-input"
            />
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="confirm-btn-cancel"
                onClick={modal.onCancel}
              >
                {modal.cancelLabel}
              </button>
              <button type="submit" className="confirm-btn-primary">
                {modal.confirmLabel}
              </button>
            </div>
          </form>
        )}

        {modal.type !== 'prompt' && (
          <div className="confirm-modal-actions">
            <button
              type="button"
              className="confirm-btn-cancel"
              onClick={modal.onCancel}
            >
              {modal.cancelLabel}
            </button>
            <button
              type="button"
              className={modal.isDanger ? 'confirm-btn-danger' : 'confirm-btn-primary'}
              onClick={modal.onConfirm}
              autoFocus
            >
              {isDelete && <FaTrash style={{ fontSize: '12px' }} />}
              {modal.confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default confirmToast;
