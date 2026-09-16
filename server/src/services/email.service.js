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
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
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

        const fromName = hospitalName || 'Hospital';
        const fromEmail = process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@medical365.in';

        const mailOptions = {
            from: `"${fromName}" <${fromEmail}>`,
            to: patientEmail,
            subject: `Appointment Confirmed | ${fromName}`,
            html: htmlBody
        };

        await transporter.sendMail(mailOptions);
        console.log(`[email-service] Appointment confirmation email sent to ${patientEmail} from ${fromName}`);

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
 * @param {string} [params.hospitalName] - Name of hospital for white-labeling
 * @param {string} [params.emailDisplayName] - Custom from display name
 * @param {string} [params.hospitalLogo] - Logo URL
 * @param {string} [params.supportEmail] - Support contact
 * @param {string} [params.hospitalPhone] - Hospital phone
 * @param {string} [params.hospitalAddress] - Hospital physical address
 */
async function sendLoginOtpEmail({
    email,
    otp,
    userName,
    hospitalName,
    emailDisplayName,
    hospitalLogo,
    supportEmail,
    hospitalPhone,
    hospitalAddress
}) {
    try {
        if (!email) {
            console.log('[email-service] No email provided — skipping OTP email.');
            return;
        }

        const effectiveDisplayName = emailDisplayName || hospitalName || 'Medical365 Authentication';
        const senderEmail = process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@medical365.in';
        const fromHeader = `"${effectiveDisplayName}" <${senderEmail}>`;
        const replyTo = supportEmail || 'support@medical365.in';

        const plainTextBody = `Hello${userName ? ' ' + userName : ''},

Your login verification code for ${hospitalName || 'Medical365'} is:
${otp}

This OTP is valid for 5 minutes.
If you did not request this login, please contact your hospital administrator.

Support: ${replyTo}
${hospitalPhone ? 'Phone: ' + hospitalPhone + '\n' : ''}${hospitalAddress ? 'Address: ' + hospitalAddress + '\n' : ''}
Powered by Medical365`;

        const htmlBody = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Segoe UI',Roboto,Arial,sans-serif;"><span style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your ${effectiveDisplayName} verification code is ready.</span><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:30px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);"><tr><td style="background:linear-gradient(135deg,#1e293b,#0f172a);padding:32px 40px;text-align:center;">${hospitalLogo ? `<img src="${hospitalLogo}" alt="${effectiveDisplayName}" style="max-height:48px;max-width:200px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;" />` : ''}<h1 style="margin:0;color:#38bdf8;font-size:22px;font-weight:700;letter-spacing:0.5px;">${effectiveDisplayName}</h1><p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;letter-spacing:0.3px;">Login Verification</p></td></tr><tr><td style="padding:36px 40px;"><p style="margin:0 0 16px;font-size:16px;color:#334155;">Hello <strong>${userName || 'User'}</strong>,</p><p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.5;">Your verification OTP for <strong>${hospitalName || 'Medical365'}</strong> is:</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><div style="display:inline-block;background-color:#f0f9ff;border:2px dashed #38bdf8;border-radius:10px;padding:18px 36px;"><span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#0369a1;font-family:Consolas,monospace;">${otp}</span></div></td></tr></table><p style="margin:24px 0 8px;font-size:14px;color:#64748b;text-align:center;">This OTP is valid for <strong>5 minutes</strong>.</p><p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;">If you did not request this OTP, please contact your hospital administrator.</p></td></tr>${(hospitalAddress || hospitalPhone || supportEmail) ? `<tr><td style="padding:0 40px 24px;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;padding:14px 18px;border:1px solid #e2e8f0;font-size:13px;color:#64748b;"><tr><td><p style="margin:0 0 4px;font-weight:700;color:#475569;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;">Hospital Contact</p>${hospitalAddress ? `<p style="margin:2px 0;">📍 ${hospitalAddress}</p>` : ''}${hospitalPhone ? `<p style="margin:2px 0;">📞 ${hospitalPhone}</p>` : ''}${supportEmail ? `<p style="margin:2px 0;">✉️ ${supportEmail}</p>` : ''}</td></tr></table></td></tr>` : ''}<tr><td style="background-color:#0f172a;padding:20px 40px;text-align:center;"><p style="margin:0;font-size:12px;color:#94a3b8;">&copy; ${new Date().getFullYear()} ${hospitalName || 'Medical365'}. All rights reserved.</p><p style="margin:6px 0 0;font-size:11px;color:#64748b;">Powered by <span style="color:#38bdf8;font-weight:600;">Medical365</span></p></td></tr></table></td></tr></table></body></html>`;

        const messageId = '<' + crypto.randomBytes(16).toString('hex') + '@medical365.in>';

        const mailOptions = {
            from: fromHeader,
            replyTo: replyTo,
            to: email,
            subject: hospitalName ? `${hospitalName} - Login Verification Code` : 'Medical365 Login Verification Code',
            text: plainTextBody,
            html: htmlBody,
            messageId: messageId,
            date: new Date().toUTCString(),
            headers: {
                'List-Unsubscribe': `<mailto:${replyTo}?subject=unsubscribe>`,
                'X-Entity-Ref-ID': crypto.randomBytes(8).toString('hex')
            }
        };

        await transporter.sendMail(mailOptions);
        console.log(`[email-service] Login OTP email sent to ${email} with from "${effectiveDisplayName}"`);

    } catch (error) {
        console.error('[email-service] Failed to send login OTP email:', error.message);
    }
}

/**
 * Send a welcome email to a newly created staff member with their login details.
 * 
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} params.name
 * @param {string} params.role
 * @param {string} params.hospitalName
 * @param {string} params.loginUrl
 */
async function sendStaffWelcomeEmail({ email, password, name, role, hospitalName, loginUrl }) {
    try {
        if (!email) return;

        const hName = hospitalName || 'Medical 365';
        const fromEmail = process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@medical365.in';
        
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
                        <td style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:32px 40px;text-align:center;">
                            <h1 style="margin:0;color:#14b8a6;font-size:24px;font-weight:700;letter-spacing:0.5px;">
                                Welcome to ${hName}
                            </h1>
                            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
                                Your staff account has been successfully created.
                            </p>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding:32px 40px;">
                            <p style="margin:0 0 20px;font-size:16px;color:#334155;line-height:1.6;">
                                Hi <strong>${name || 'Staff Member'}</strong>,
                            </p>
                            <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                                You have been invited to join the ${hName} team as a <strong>${role || 'Staff Member'}</strong>. Below are your secure login credentials to access the management portal.
                            </p>

                            <!-- Credentials Box -->
                            <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:28px;">
                                <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Login Details</p>
                                <table width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
                                    <tr>
                                        <td style="padding:6px 0;color:#475569;width:90px;">Email:</td>
                                        <td style="padding:6px 0;font-weight:700;color:#0f172a;">${email}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding:6px 0;color:#475569;">Password:</td>
                                        <td style="padding:6px 0;font-weight:700;color:#14b8a6;letter-spacing:1px;">${password}</td>
                                    </tr>
                                </table>
                            </div>

                            <!-- CTA Button -->
                            <div style="text-align:center;margin-bottom:20px;">
                                <a href="${loginUrl || 'https://medical365.in'}" style="display:inline-block;background-color:#14b8a6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;box-shadow:0 2px 4px rgba(20,184,166,0.3);">
                                    Click here to Login
                                </a>
                            </div>

                            <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;">
                                We recommend changing your password after your first login.
                            </p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color:#0f172a;padding:20px 40px;text-align:center;">
                            <p style="margin:0;font-size:12px;color:#64748b;">
                                This is an automated email. Please do not reply.
                            </p>
                            <p style="margin:8px 0 0;font-size:11px;color:#475569;">
                                Powered by <span style="color:#14b8a6;font-weight:700;">Medical365</span>
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
            from: `"${hName}" <${fromEmail}>`,
            to: email,
            subject: `Welcome to ${hName} | Your Account Credentials`,
            html: htmlBody
        };

        await transporter.sendMail(mailOptions);
        console.log(`[email-service] Staff welcome email sent to ${email} with from "${hName}"`);

    } catch (error) {
        console.error('[email-service] Failed to send staff welcome email:', error.message);
    }
}

/**
 * Render a live email preview without transmitting over SMTP.
 * Used for Hospital Admin preview modals.
 */
function renderEmailPreview({ type = 'otp', hospital = {}, recipientName = 'Dr. Rahul Sharma' }) {
    const isCentral = !hospital || !hospital.name;
    const hospitalName = isCentral ? 'Medical365' : (hospital.name || 'Hospital');
    const emailDisplayName = isCentral ? 'Medical365 Support' : (hospital.branding?.emailDisplayName || hospital.brandingSchema?.emailDisplayName || hospitalName);
    const logoUrl = isCentral ? '' : (hospital.branding?.logoUrl || hospital.logo || '');
    const supportEmail = isCentral ? 'support@medical365.in' : (hospital.branding?.supportEmail || hospital.email || 'support@hospital.com');
    const supportPhone = isCentral ? '' : (hospital.branding?.supportPhone || hospital.phone || '');
    const address = isCentral ? '' : ([hospital.address, hospital.city, hospital.state].filter(Boolean).join(', ') || '');
    const senderEmail = process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@medical365.in';

    const isOtp = String(type).toLowerCase().includes('otp');

    if (isOtp) {
        const fromHeader = `"${emailDisplayName}" <${senderEmail}>`;
        const subject = `${hospitalName} - Login Verification Code`;
        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Segoe UI',Roboto,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:20px 0;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);"><tr><td style="background:linear-gradient(135deg,#1e293b,#0f172a);padding:28px 36px;text-align:center;">${logoUrl ? `<img src="${logoUrl}" alt="${emailDisplayName}" style="max-height:44px;max-width:180px;margin-bottom:10px;display:block;margin-left:auto;margin-right:auto;" />` : ''}<h1 style="margin:0;color:#38bdf8;font-size:20px;font-weight:700;">${emailDisplayName}</h1><p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:12px;">Login Verification OTP</p></td></tr><tr><td style="padding:28px 36px;"><p style="margin:0 0 14px;font-size:15px;color:#334155;">Hello <strong>${recipientName}</strong>,</p><p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.5;">Your verification OTP for <strong>${hospitalName}</strong> is:</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><div style="display:inline-block;background-color:#f0f9ff;border:2px dashed #38bdf8;border-radius:8px;padding:14px 28px;"><span style="font-size:30px;font-weight:800;letter-spacing:8px;color:#0369a1;font-family:Consolas,monospace;">482931</span></div></td></tr></table><p style="margin:20px 0 6px;font-size:13px;color:#64748b;text-align:center;">This OTP expires in <strong>5 minutes</strong>.</p><p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">If you did not request this OTP, please contact your hospital administrator.</p></td></tr><tr><td style="padding:0 36px 20px;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;padding:12px 16px;border:1px solid #e2e8f0;font-size:12px;color:#64748b;"><tr><td><p style="margin:0 0 4px;font-weight:700;color:#475569;text-transform:uppercase;font-size:10px;letter-spacing:0.5px;">Hospital Contact</p>${address ? `<p style="margin:2px 0;">📍 ${address}</p>` : ''}${supportPhone ? `<p style="margin:2px 0;">📞 ${supportPhone}</p>` : ''}${supportEmail ? `<p style="margin:2px 0;">✉️ ${supportEmail}</p>` : ''}</td></tr></table></td></tr><tr><td style="background-color:#0f172a;padding:16px 36px;text-align:center;"><p style="margin:0;font-size:11px;color:#94a3b8;">&copy; ${new Date().getFullYear()} ${hospitalName}. All rights reserved.</p><p style="margin:4px 0 0;font-size:10px;color:#64748b;">Powered by <span style="color:#38bdf8;font-weight:600;">Medical365</span></p></td></tr></table></td></tr></table></body></html>`;

        return {
            from: fromHeader,
            subject,
            html,
            text: `Hello ${recipientName},\n\nYour verification OTP for ${hospitalName} is: 482931\n\nThis OTP is valid for 5 minutes.`
        };
    }

    // Appointment confirmation preview
    const fromHeader = `"${hospitalName}" <${senderEmail}>`;
    const subject = `Appointment Confirmed | ${hospitalName}`;
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Roboto,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:20px 0;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);"><tr><td style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:28px 36px;text-align:center;"><h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${hospitalName}</h1><p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:12px;">Appointment Confirmation</p></td></tr><tr><td style="padding:24px 36px 0;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;"><tr><td><p style="margin:0;font-size:14px;font-weight:700;color:#166534;">✅ Appointment Confirmed for Rahul Sharma</p><p style="margin:4px 0 0;font-size:12px;color:#15803d;">Please arrive 15 minutes before your scheduled appointment.</p></td></tr></table></td></tr><tr><td style="padding:20px 36px;"><table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#334155;"><tr style="background-color:#f8fafc;"><td style="padding:8px;font-weight:600;color:#64748b;width:160px;">Doctor</td><td style="padding:8px;font-weight:700;">Dr. Amit Sharma</td></tr><tr><td style="padding:8px;font-weight:600;color:#64748b;">Department</td><td style="padding:8px;">General Medicine</td></tr><tr style="background-color:#f8fafc;"><td style="padding:8px;font-weight:600;color:#64748b;">Date & Time</td><td style="padding:8px;font-weight:700;">Tomorrow, 10:30 AM</td></tr><tr><td style="padding:8px;font-weight:600;color:#64748b;">Fee Status</td><td style="padding:8px;"><span style="background-color:#dcfce7;color:#166534;padding:2px 10px;border-radius:12px;font-weight:700;font-size:11px;">Paid</span></td></tr></table></td></tr><tr><td style="padding:0 36px 20px;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;padding:12px 16px;border:1px solid #e2e8f0;font-size:12px;color:#64748b;"><tr><td><p style="margin:0 0 4px;font-weight:700;color:#475569;text-transform:uppercase;font-size:10px;">Hospital Contact</p>${address ? `<p style="margin:2px 0;">📍 ${address}</p>` : ''}${supportPhone ? `<p style="margin:2px 0;">📞 ${supportPhone}</p>` : ''}${supportEmail ? `<p style="margin:2px 0;">✉️ ${supportEmail}</p>` : ''}</td></tr></table></td></tr><tr><td style="background-color:#1e293b;padding:16px 36px;text-align:center;"><p style="margin:0;font-size:11px;color:#94a3b8;">This is an automated confirmation from ${hospitalName}.</p><p style="margin:4px 0 0;font-size:10px;color:#64748b;">Powered by <span style="color:#818cf8;font-weight:700;">Medical365</span></p></td></tr></table></td></tr></table></body></html>`;

    return {
        from: fromHeader,
        subject,
        html,
        text: `Appointment Confirmed with ${hospitalName}\n\nPatient: Rahul Sharma\nDoctor: Dr. Amit Sharma\nThank you for choosing ${hospitalName}.`
    };
}

module.exports = {
    sendAppointmentConfirmationEmail,
    sendLoginOtpEmail,
    sendStaffWelcomeEmail,
    renderEmailPreview
};
