const ImageKit = require('imagekit');
const dotenv = require('dotenv');
dotenv.config();

const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINTS,
});

async function run() {
    try {
        const buffer = Buffer.from('hello world', 'utf8');
        const res = await imagekit.upload({
            file: buffer,
            fileName: 'test.txt'
        });
        console.log('Upload success:', res.url);
    } catch (err) {
        console.error('Upload failed:', err);
    }
}
run();
