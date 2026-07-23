import React, { useState } from 'react';
import { HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';

const PasswordInput = ({ className, style, ...props }) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
            <input 
                {...props}
                type={showPassword ? "text" : "password"} 
                className={className}
                style={{ ...style, width: '100%', paddingRight: '2.5rem' }}
            />
            <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#94a3b8',
                    zIndex: 10
                }}
                aria-label={showPassword ? "Hide password" : "Show password"}
            >
                {showPassword ? <HiOutlineEyeOff size={20} /> : <HiOutlineEye size={20} />}
            </button>
        </div>
    );
};

export default PasswordInput;
