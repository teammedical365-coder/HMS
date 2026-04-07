/**
 * otpService.js — sends OTP SMS for patient app login.
 * Provider selected by OTP_PROVIDER env var:
 *   'console' → logs to terminal (development)
 *   'msg91'   → MSG91 (India, recommended)
 *   'twilio'  → Twilio (international)
 */

const crypto = require('crypto');
const axios  = require('axios');

const PROVIDER = process.env.OTP_PROVIDER || 'console';

// Generate a 6-digit OTP
const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

// ─── Providers ────────────────────────────────────────────────────────────────

const sendViaConsole = async (phone, otp) => {
    console.log(`\n[OTP] ──────────────────────────────`);
    console.log(`[OTP] Phone: ${phone}`);
    console.log(`[OTP] OTP:   ${otp}`);
    console.log(`[OTP] ──────────────────────────────\n`);
    return { success: true };
};

const sendViaMSG91 = async (phone, otp) => {
    const authKey    = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;

    if (!authKey || !templateId) {
        throw new Error('MSG91_AUTH_KEY or MSG91_TEMPLATE_ID not configured');
    }

    // MSG91 Send OTP API
    const resp = await axios.post('https://control.msg91.com/api/v5/otp', {
        template_id: templateId,
        mobile:      `91${phone}`,    // India country code
        otp,
    }, {
        headers: {
            authkey: authKey,
            'Content-Type': 'application/json',
        },
        timeout: 8000,
    });

    if (resp.data?.type === 'success') return { success: true };
    throw new Error(resp.data?.message || 'MSG91 send failed');
};

const sendViaTwilio = async (phone, otp) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const from       = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !from) {
        throw new Error('Twilio credentials not configured');
    }

    const resp = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        new URLSearchParams({
            From: from,
            To:   `+91${phone}`,
            Body: `Your Medical365 OTP is ${otp}. Valid for 10 minutes. Do not share this with anyone.`,
        }),
        {
            auth: { username: accountSid, password: authToken },
            timeout: 8000,
        }
    );

    if (resp.data?.sid) return { success: true };
    throw new Error('Twilio send failed');
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * sendOTP — generate and send OTP to phone.
 * Returns { otp } so the caller can hash + store it.
 */
const sendOTP = async (phone) => {
    const otp = generateOTP();

    switch (PROVIDER) {
        case 'msg91':   await sendViaMSG91(phone, otp);   break;
        case 'twilio':  await sendViaTwilio(phone, otp);  break;
        default:        await sendViaConsole(phone, otp); break;
    }

    return { otp };
};

/**
 * hashOTP — bcrypt hash for storage (not plaintext in DB).
 */
const bcrypt = require('bcryptjs');
const hashOTP = async (otp) => bcrypt.hash(otp, 6);  // low rounds — OTP is short-lived

/**
 * verifyOTP — compare input against stored hash.
 */
const verifyOTP = async (input, hash) => bcrypt.compare(input, hash);

module.exports = { sendOTP, hashOTP, verifyOTP };
