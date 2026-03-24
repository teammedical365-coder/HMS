export const getSubdomain = () => {
    const hostname = window.location.hostname;

    // Direct IPs or naked localhost
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname === 'localhost') {
        return null;
    }

    const parts = hostname.split('.');

    // Localhost Subdomain testing (e.g., citycare.localhost)
    if (hostname.endsWith('localhost') && parts.length >= 2) {
        return parts[0] === 'www' ? null : parts[0];
    }

    // Live domain (e.g., citycare.myurl.com)
    // We assume the base domain has at least 2 parts (myurl.com)
    if (parts.length >= 3) {
        const subdomain = parts[0];
        if (subdomain === 'www') {
            return parts.length > 3 ? parts[1] : null;
        }
        return subdomain; 
    }

    return null;
};
