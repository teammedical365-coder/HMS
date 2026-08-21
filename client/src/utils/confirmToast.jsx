import React from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { FaTriangleExclamation, FaPenToSquare } from 'react-icons/fa6';

export { toast, Toaster };

/**
 * Super-fast, ultra-clean confirmation toast popup using react-hot-toast.
 *
 * Usage:
 *   if (!(await confirmToast('Are you sure you want to delete this?'))) return;
 */
export const confirmToast = (message, options = {}) => {
  return new Promise((resolve) => {
    const onConfirmCb = typeof options === 'function' ? options : options.onConfirm;
    const confirmLabel = (typeof options === 'object' && options.confirmText) || 'Delete';
    const cancelLabel = (typeof options === 'object' && options.cancelText) || 'Cancel';
    const title = (typeof options === 'object' && options.title) || 'Please Confirm';
    const isDanger = typeof options === 'object' && options.danger !== undefined ? options.danger : true;

    toast.custom(
      (t) => (
        <div
          style={{
            minWidth: '320px',
            maxWidth: '430px',
            width: '100%',
            background: '#ffffff',
            boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.28), 0 4px 15px rgba(0,0,0,0.06)',
            borderRadius: '18px',
            border: '1px solid #e2e8f0',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            padding: '18px 20px',
            pointerEvents: 'auto',
            transform: t.visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-8px)',
            opacity: t.visible ? 1 : 0,
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 999999,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: isDanger ? '#fef2f2' : '#f0fdf4',
                border: `1.5px solid ${isDanger ? '#fecaca' : '#bbf7d0'}`,
                color: isDanger ? '#ef4444' : '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                flexShrink: 0,
              }}
            >
              <FaTriangleExclamation />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                {title}
              </h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.45 }}>
                {message}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(t.id);
                if (typeof options === 'object' && options.onCancel) options.onCancel();
                resolve(false);
              }}
              style={{
                padding: '7px 15px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                background: '#f8fafc',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 650,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(t.id);
                if (onConfirmCb) onConfirmCb();
                resolve(true);
              }}
              style={{
                padding: '7px 18px',
                borderRadius: '10px',
                border: 'none',
                background: isDanger
                  ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                  : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 750,
                cursor: 'pointer',
                boxShadow: isDanger
                  ? '0 4px 12px rgba(239, 68, 68, 0.3)'
                  : '0 4px 12px rgba(5, 150, 105, 0.3)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      {
        duration: 12000,
        position: 'top-center',
      }
    );
  });
};

/**
 * Super-fast, sleek prompt toast popup to replace window.prompt()
 *
 * Usage:
 *   const newName = await promptToast('Enter new name for category:', { defaultValue: oldName, title: 'Rename Category' });
 *   if (!newName) return;
 */
export const promptToast = (message, options = {}) => {
  return new Promise((resolve) => {
    const title = options.title || 'Edit Information';
    const defaultValue = options.defaultValue || '';
    const placeholder = options.placeholder || 'Type here...';
    const confirmLabel = options.confirmText || 'Save';
    const cancelLabel = options.cancelText || 'Cancel';

    toast.custom(
      (t) => {
        let currentValue = defaultValue;

        return (
          <div
            style={{
              minWidth: '340px',
              maxWidth: '440px',
              width: '100%',
              background: '#ffffff',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.32), 0 4px 18px rgba(0,0,0,0.08)',
              borderRadius: '18px',
              border: '1.5px solid #cbd5e1',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              padding: '20px',
              pointerEvents: 'auto',
              transform: t.visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-8px)',
              opacity: t.visible ? 1 : 0,
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              zIndex: 999999,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#eff6ff',
                  border: '1.5px solid #bfdbfe',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  flexShrink: 0,
                }}
              >
                <FaPenToSquare />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  {title}
                </h4>
                {message && (
                  <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                    {message}
                  </p>
                )}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                toast.dismiss(t.id);
                resolve(currentValue);
              }}
            >
              <input
                type="text"
                autoFocus
                defaultValue={defaultValue}
                placeholder={placeholder}
                onChange={(e) => { currentValue = e.target.value; }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1.5px solid #94a3b8',
                  borderRadius: '10px',
                  fontSize: '14px',
                  color: '#0f172a',
                  boxSizing: 'border-box',
                  outline: 'none',
                  marginBottom: '16px',
                  transition: 'border-color 0.2s',
                  background: '#ffffff',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#2563eb';
                  e.target.select();
                }}
                onBlur={(e) => { e.target.style.borderColor = '#94a3b8'; }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    toast.dismiss(t.id);
                    resolve(null);
                  }}
                  style={{
                    padding: '7px 15px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#334155',
                    fontSize: '13px',
                    fontWeight: 650,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                >
                  {cancelLabel}
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '7px 18px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 750,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  {confirmLabel}
                </button>
              </div>
            </form>
          </div>
        );
      },
      {
        duration: 60000,
        position: 'top-center',
      }
    );
  });
};

export default confirmToast;
