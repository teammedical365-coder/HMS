const ImageKit = require("imagekit");

let imagekit = null;

if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINTS) {
    console.warn('[ImageKit] Missing credentials — file uploads will fail. Set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINTS in .env');
    imagekit = {
        upload: () => Promise.reject(new Error('ImageKit credentials missing in environment.')),
        deleteFile: () => Promise.reject(new Error('ImageKit credentials missing in environment.'))
    };
} else {
    imagekit = new ImageKit({
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINTS,
    });
}

module.exports = imagekit;
