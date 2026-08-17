require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const axios = require('axios');

(async () => {
    try {
        const response = await axios.post(
            `${process.env.KIMI_BASE_URL || 'https://manishmahi505--ep-kimi-k3-server.us-west.modal.direct/v1'}/chat/completions`,
            {
                model: process.env.KIMI_MODEL || 'moonshotai/Kimi-K3',
                messages: [{ role: "user", content: "Test message" }],
                temperature: 0.3
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.MODAL_PROXY_TOKEN_ID}.${process.env.MODAL_PROXY_TOKEN_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log("Success:", response.data);
    } catch (e) {
        console.error("Status:", e.response?.status);
        console.error("Data:", JSON.stringify(e.response?.data, null, 2));
    }
})();
