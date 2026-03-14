const net = require('net');

const host = 'ac-0tmzcur-shard-00-00.bzkyl0e.mongodb.net';
const port = 27017;

console.log(`Testing connection to ${host}:${port}...`);

const socket = new net.Socket();
socket.setTimeout(5000);

socket.on('connect', () => {
    console.log(`Successfully connected to ${host} on port ${port}!`);
    socket.destroy();
});

socket.on('timeout', () => {
    console.log(`Connection timed out when trying to connect to ${host} on port ${port}.`);
    console.log('This usually means the network you are on (like a corporate, university, or public network) is blocking outbound traffic on port 27017.');
    socket.destroy();
});

socket.on('error', (err) => {
    console.log(`Connection failed: ${err.message}`);
    socket.destroy();
});

socket.connect(port, host);
