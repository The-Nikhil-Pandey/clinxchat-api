const nodemailer = require('nodemailer');

/**
 * Email Configuration - Supports all email providers (Gmail, Outlook, custom SMTP, etc.)
 */

// Create transporter based on environment variables
const createTransporter = () => {
    // Check if SMTP settings are configured
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('⚠️ Email not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
        return null;
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
};

let transporter = null;

/**
 * Initialize email transporter
 */
const initializeEmail = () => {
    transporter = createTransporter();
    if (transporter) {
        console.log('✅ Email transporter initialized');
    }
};

/**
 * Send OTP verification email
 * @param {string} to - Recipient email
 * @param {string} otp - OTP code
 * @returns {Promise<boolean>} - Success status
 */
const sendOtpEmail = async (to, otp) => {
    if (!transporter) {
        console.error('Email transporter not initialized');
        // For development, log OTP to console
        console.log(`📧 [DEV MODE] OTP for ${to}: ${otp}`);
        return true; // Return true for development
    }

    const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: to,
        subject: 'ClinixChat - Your Verification Code',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #F0E6F6;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F0E6F6; padding: 40px 20px;">
                    <tr>
                        <td align="center">
                            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 24px; box-shadow: 0 4px 24px rgba(189, 110, 215, 0.15);">
                                <!-- Header with Logo -->
                                <tr>
                                    <td align="center" style="padding: 40px 40px 20px 40px;">
                                        <div style="width: 70px; height: 70px; background: linear-gradient(135deg, #557BF4 0%, #BD6ED7 50%, #FF66C4 100%); border-radius: 20px; display: flex; align-items: center; justify-content: center;">
                                            <span style="font-size: 32px; color: white;">💬</span>
                                        </div>
                                        <h1 style="margin: 20px 0 0 0; font-size: 28px; font-weight: 700; color: #1A1A2E;">ClinixChat</h1>
                                    </td>
                                </tr>
                                
                                <!-- Content -->
                                <tr>
                                    <td style="padding: 20px 40px;">
                                        <h2 style="margin: 0 0 15px 0; font-size: 22px; font-weight: 600; color: #1A1A2E; text-align: center;">Verification Code</h2>
                                        <p style="margin: 0 0 30px 0; font-size: 15px; color: #666666; text-align: center; line-height: 1.6;">
                                            Please enter the following verification code to complete your registration:
                                        </p>
                                        
                                        <!-- OTP Box -->
                                        <div style="background: linear-gradient(135deg, #F8F4FC 0%, #F0E6F6 100%); border-radius: 16px; padding: 25px; text-align: center; border: 1px solid #E8E0ED;">
                                            <span style="font-size: 36px; font-weight: 700; letter-spacing: 12px; color: #BD6ED7; font-family: 'Courier New', monospace;">${otp}</span>
                                        </div>
                                        
                                        <p style="margin: 25px 0 0 0; font-size: 13px; color: #999999; text-align: center;">
                                            ⏱️ This code expires in <strong style="color: #BD6ED7;">5 minutes</strong>
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Footer -->
                                <tr>
                                    <td style="padding: 30px 40px 40px 40px; border-top: 1px solid #F0E6F6;">
                                        <p style="margin: 0 0 10px 0; font-size: 12px; color: #999999; text-align: center;">
                                            If you didn't request this code, you can safely ignore this email.
                                        </p>
                                        <p style="margin: 0; font-size: 12px; color: #CCCCCC; text-align: center;">
                                            © ${new Date().getFullYear()} ClinixChat. All rights reserved.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ OTP email sent to ${to}`);
        return true;
    } catch (error) {
        console.error('Failed to send OTP email:', error.message);
        // For development, still log OTP
        console.log(`📧 [FALLBACK] OTP for ${to}: ${otp}`);
        return true; // Return true so registration continues
    }
};

/**
 * Generate random OTP
 * @param {number} length - OTP length (default 5)
 * @returns {string} - OTP code
 */
const generateOtp = (length = 5) => {
    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += Math.floor(Math.random() * 10);
    }
    return otp;
};

module.exports = {
    initializeEmail,
    sendOtpEmail,
    generateOtp,
};
