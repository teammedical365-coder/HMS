const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Create reusable transporter using SMTP config from .env
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/**
 * Send appointment confirmation email to a patient.
 * This function NEVER throws — failures are logged silently so registration is never blocked.
 *
 * @param {Object} params
 * @param {string} params.patientName
 * @param {string} params.patientEmail
 * @param {string} params.mrn
 * @param {string} params.appointmentId
 * @param {string} params.doctorName
 * @param {string} params.department
 * @param {string} params.appointmentDate
 * @param {string} params.appointmentTime
 * @param {number|string} params.consultationFee
 * @param {string} params.paymentStatus
 * @param {string} params.hospitalName
 * @param {string} params.hospitalAddress
 * @param {string} params.hospitalPhone
 */
async function sendAppointmentConfirmationEmail({
    patientName,
    patientEmail,
    mrn,
    appointmentId,
    doctorName,
    department,
    appointmentDate,
    appointmentTime,
    consultationFee,
    paymentStatus,
    paymentMode,
    hospitalName,
    hospitalAddress,
    hospitalPhone
}) {
    try {
        if (!patientEmail) {
            console.log('[email-service] No patient email provided — skipping confirmation email.');
            return;
        }

        const formattedDate = new Date(appointmentDate).toLocaleDateString('en-IN', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
        });

        const fee = Number(consultationFee) || 0;

        const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:30px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:32px 40px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">
                                ${hospitalName || 'Hospital'}
                            </h1>
                            <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">
                                Appointment Confirmation
                            </p>
                        </td>
                    </tr>

                    <!-- Success Banner -->
                    <tr>
                        <td style="padding:28px 40px 0;">
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px 22px;">
                                <tr>
                                    <td>
                                        <p style="margin:0;font-size:15px;font-weight:700;color:#166534;">
                                            ✅ Your appointment has been successfully booked.
                                        </p>
                                        <p style="margin:6px 0 0;font-size:13px;color:#15803d;">
                                            Please arrive 15 minutes before your appointment.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Appointment Details -->
                    <tr>
                        <td style="padding:24px 40px;">
                            <h2 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">
                                Appointment Details
                            </h2>
                            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#334155;">
                                <tr>
                                    <td style="padding:8px 0;font-weight:600;color:#64748b;width:180px;">Patient Name</td>
                                    <td style="padding:8px 0;font-weight:700;color:#1e293b;">${patientName || '—'}</td>
                                </tr>
                                <tr style="background-color:#f8fafc;">
                                    <td style="padding:8px 0 8px 8px;font-weight:600;color:#64748b;">MRN</td>
                                    <td style="padding:8px 0;font-weight:700;color:#6366f1;">${mrn || '—'}</td>
                                </tr>
                                <tr>
                                    <td style="padding:8px 0;font-weight:600;color:#64748b;">Appointment ID</td>
                                    <td style="padding:8px 0;">${appointmentId || '—'}</td>
                                </tr>
                                <tr style="background-color:#f8fafc;">
                                    <td style="padding:8px 0 8px 8px;font-weight:600;color:#64748b;">Doctor</td>
                                    <td style="padding:8px 0;font-weight:700;">Dr. ${doctorName || '—'}</td>
                                </tr>
                                <tr>
                                    <td style="padding:8px 0;font-weight:600;color:#64748b;">Department</td>
                                    <td style="padding:8px 0;">${department || 'General'}</td>
                                </tr>
                                <tr style="background-color:#f8fafc;">
                                    <td style="padding:8px 0 8px 8px;font-weight:600;color:#64748b;">Date</td>
                                    <td style="padding:8px 0;font-weight:700;">${formattedDate}</td>
                                </tr>
                                <tr>
                                    <td style="padding:8px 0;font-weight:600;color:#64748b;">Time</td>
                                    <td style="padding:8px 0;font-weight:700;">${appointmentTime || 'Token-based'}</td>
                                </tr>
                                <tr style="background-color:#f8fafc;">
                                    <td style="padding:8px 0 8px 8px;font-weight:600;color:#64748b;">Consultation Fee</td>
                                    <td style="padding:8px 0;font-weight:700;color:#1e293b;">₹${fee.toLocaleString('en-IN')}</td>
                                </tr>
                                <tr>
                                    <td style="padding:8px 0;font-weight:600;color:#64748b;">Payment Status</td>
                                    <td style="padding:8px 0;">
                                        <span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700;background-color:${(paymentStatus || '').toLowerCase().includes('paid') ? '#dcfce7' : '#fef3c7'};color:${(paymentStatus || '').toLowerCase().includes('paid') ? '#166534' : '#92400e'};">
                                            ${paymentStatus || 'Pending'}
                                        </span>
                                    </td>
                                </tr>
                                <tr style="background-color:#f8fafc;">
                                    <td style="padding:8px 0 8px 8px;font-weight:600;color:#64748b;">Payment Mode</td>
                                    <td style="padding:8px 0;font-weight:700;">${paymentMode || 'Not Available'}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Hospital Contact -->
                    <tr>
                        <td style="padding:0 40px 28px;">
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:10px;padding:16px 20px;border:1px solid #e2e8f0;">
                                <tr>
                                    <td>
                                        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.3px;">Hospital Contact</p>
                                        ${hospitalAddress ? `<p style="margin:2px 0;font-size:13px;color:#64748b;">📍 ${hospitalAddress}</p>` : ''}
                                        ${hospitalPhone ? `<p style="margin:2px 0;font-size:13px;color:#64748b;">📞 ${hospitalPhone}</p>` : ''}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color:#1e293b;padding:20px 40px;text-align:center;">
                            <p style="margin:0;font-size:12px;color:#94a3b8;">
                                This is an automated email. Please do not reply.
                            </p>
                            <p style="margin:8px 0 0;font-size:11px;color:#64748b;">
                                Powered by <span style="color:#818cf8;font-weight:700;">Medical365</span>
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

        const mailOptions = {
            from: process.env.MAIL_FROM || process.env.SMTP_USER,
            to: patientEmail,
            subject: `Appointment Confirmed | ${hospitalName || 'Hospital'} | Medical365`,
            html: htmlBody
        };

        await transporter.sendMail(mailOptions);
        console.log(`[email-service] Appointment confirmation email sent to ${patientEmail}`);

    } catch (error) {
        // NEVER throw — email failure must not block patient registration
        console.error('[email-service] Failed to send appointment confirmation email:', error.message);
    }
}

/**
 * Send a login verification OTP email to a staff/admin user.
 * This function NEVER throws — failures are logged silently.
 *
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.otp - The plain 6-digit OTP (shown in email)
 * @param {string} [params.userName] - Recipient name for greeting
 */
async function sendLoginOtpEmail({ email, otp, userName }) {
    try {
        if (!email) {
            console.log('[email-service] No email provided — skipping OTP email.');
            return;
        }

        const plainTextBody = `Hi${userName ? ' ' + userName : ''},

Your login verification code is:
${otp}

This OTP is valid for 5 minutes.
If you did not request this login, please ignore this email.

Support: support@medical365.in
Powered by Medical365`;

        const htmlBody = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,sans-serif;"><span style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your Medical365 verification code is ready.</span><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;padding:20px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;"><tr><td style="background-color:#2563eb;padding:24px;text-align:center;border-top-left-radius:8px;border-top-right-radius:8px;"><h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:bold;">Medical365</h1></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 16px;font-size:16px;color:#334155;">Hi${userName ? ' ' + userName : ''},</p><p style="margin:0 0 24px;font-size:16px;color:#334155;">Your login verification code is:</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><div style="display:inline-block;background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:16px 32px;"><span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#0f172a;">${otp}</span></div></td></tr></table><p style="margin:24px 0 0;font-size:14px;color:#64748b;">This OTP is valid for <strong>5 minutes</strong>.</p><p style="margin:8px 0 0;font-size:14px;color:#64748b;">If you did not request this login, please ignore this email.</p></td></tr><tr><td style="background-color:#f8fafc;padding:20px;text-align:center;border-bottom-left-radius:8px;border-bottom-right-radius:8px;border-top:1px solid #e2e8f0;"><p style="margin:0;font-size:12px;color:#64748b;">Support: <a href="mailto:support@medical365.in" style="color:#2563eb;text-decoration:none;">support@medical365.in</a></p><p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">&copy; ${new Date().getFullYear()} Medical365. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`;

        const messageId = '<' + crypto.randomBytes(16).toString('hex') + '@medical365.in>';

        const mailOptions = {
            from: '"Medical365 Authentication" <noreply@medical365.in>',
            replyTo: 'support@medical365.in',
            to: email,
            subject: 'Medical365 Login Verification Code',
            text: plainTextBody,
            html: htmlBody,
            messageId: messageId,
            date: new Date().toUTCString(),
            headers: {
                'List-Unsubscribe': '<mailto:support@medical365.in?subject=unsubscribe>',
                'X-Entity-Ref-ID': crypto.randomBytes(8).toString('hex')
            }
        };

        await transporter.sendMail(mailOptions);
        console.log(`[email-service] Login OTP email sent to ${email}`);

    } catch (error) {
        console.error('[email-service] Failed to send login OTP email:', error.message);
    }
}

module.exports = {
    sendAppointmentConfirmationEmail,
    sendLoginOtpEmail
};
