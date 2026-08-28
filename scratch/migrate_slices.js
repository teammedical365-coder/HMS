const fs = require('fs');
const path = require('path');

const srcDir = path.join('d:', 'HMS', 'client', 'src', 'store', 'slices');
const destDir = path.join('d:', 'HMS', 'HMS-REACT-NATIVE', 'src', 'store', 'slices');

if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
    let content = fs.readFileSync(path.join(srcDir, file), 'utf8');

    // Add AsyncStorage import if not present and we need it
    if (content.includes('localStorage') && !content.includes('AsyncStorage')) {
        content = `import AsyncStorage from '@react-native-async-storage/async-storage';\n` + content;
    }

    // 1. In thunks (async contexts), replace localStorage with AsyncStorage (with await)
    // Actually, to make it simple and safe for reducers too (which are synchronous), 
    // the user said: "If synchronous access is heavily relied upon in reducers, remove the localStorage logic from the slice..."
    
    // For setItem and removeItem, AsyncStorage can be called without await just to trigger the write,
    // though it's a promise, it will execute. So we replace localStorage.setItem -> AsyncStorage.setItem
    content = content.replace(/localStorage\.setItem/g, 'AsyncStorage.setItem');
    content = content.replace(/localStorage\.removeItem/g, 'AsyncStorage.removeItem');

    // 2. Fix initialState logic (localStorage.getItem)
    // We cannot await in initialState. We should remove it.
    if (file === 'authSlice.js') {
        // Find the loadInitialState function and replace it entirely to remove localStorage.getItem
        const authInitialState = `const loadInitialState = () => {
  return {
    user: null,
    token: null,
    isAuthenticated: false,
    loading: false,
    error: null,
    otpStep: null,
    preAuthToken: null,
    otpEmail: null,
    activeSession: null,
    otpSuccessMsg: null,
    sessionExpiredMessage: null,
  };
};`;
        // regex to replace the old loadInitialState
        content = content.replace(/const loadInitialState = \(\) => \{[\s\S]*?\};\n\n/m, authInitialState + '\n\n');
    }

    fs.writeFileSync(path.join(destDir, file), content, 'utf8');
    console.log(`Migrated ${file}`);
});
