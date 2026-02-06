import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const username = process.env.USERNAME;
const password = process.env.PASSWORD;
const host = process.env.INCOMING_SERVER;
const port = Number(process.env.SMTP_PORT || 465);

if (!username || !password || !host) {
  throw new Error('Missing SMTP configuration (USERNAME, PASSWORD, INCOMING_SERVER) in .env');
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: {
    user: username,
    pass: password,
  },
});

const baseDetails = {
  from: `"517 VIP Suites and Apartments" <${username}>`,
};

const formatCurrency = (value: number) => `₦${Number(value).toLocaleString()}`;

export const sendBookingConfirmationEmail = async (
  to: string,
  bookingReference: string,
  guestName: string,
  suiteName: string,
  checkIn: string,
  checkOut: string,
  totalAmount: number
) =>
  transporter.sendMail({
    ...baseDetails,
    to,
    subject: '517 VIP Suites - Booking Confirmation',
    html: `
      <p>Dear ${guestName},</p>
      <p>Thank you for booking <strong>${suiteName}</strong> with us.</p>
      <ul>
        <li>Booking reference: ${bookingReference}</li>
        <li>Stay dates: ${new Date(checkIn).toLocaleDateString()} - ${new Date(checkOut).toLocaleDateString()}</li>
        <li>Total amount: ${formatCurrency(totalAmount)}</li>
      </ul>
      <p>We look forward to hosting you.</p>
      <p>Warm regards,<br/>517 VIP Suites &amp; Apartments</p>
    `,
  });

export const sendAdminBookingNotification = async (
  bookingReference: string,
  suiteName: string,
  guestName: string,
  guestEmail: string,
  checkIn: string,
  checkOut: string,
  totalAmount: number
) =>
  transporter.sendMail({
    ...baseDetails,
    to: username,
    subject: `New booking: ${suiteName} (${bookingReference})`,
    text: `Guest: ${guestName} <${guestEmail}>
Dates: ${new Date(checkIn).toLocaleDateString()} → ${new Date(checkOut).toLocaleDateString()}
Amount: ${formatCurrency(totalAmount)}`,
  });

export const sendPaymentConfirmationEmail = async (
  to: string,
  guestName: string,
  suiteName: string,
  amount: number,
  reference: string
) =>
  transporter.sendMail({
    ...baseDetails,
    to,
    subject: `Payment received for ${suiteName}`,
    html: `
      <p>Hi ${guestName},</p>
      <p>We have successfully received your payment.</p>
      <ul>
        <li>Reference: ${reference}</li>
        <li>Suite: ${suiteName}</li>
        <li>Amount: ${formatCurrency(amount)}</li>
      </ul>
      <p>Thank you for choosing 517 VIP Suites &amp; Apartments.</p>
    `,
  });

export const sendAdminPaymentNotification = async (
  guestName: string,
  guestEmail: string,
  suiteName: string,
  amount: number,
  reference: string
) =>
  transporter.sendMail({
    ...baseDetails,
    to: username,
    subject: `Payment confirmed: ${suiteName} (${reference})`,
    text: `Guest: ${guestName} <${guestEmail}>
Suite: ${suiteName}
Amount: ${formatCurrency(amount)}
Reference: ${reference}`,
  });

export const sendContactAcknowledgementEmail = async (to: string, name: string) =>
  transporter.sendMail({
    ...baseDetails,
    to,
    subject: 'Thanks for contacting 517 VIP Suites',
    html: `
      <p>Hi ${name},</p>
      <p>We received your message and will respond within 24 hours.</p>
      <p>Warm regards,<br/>517 VIP Suites &amp; Apartments</p>
    `,
  });

export const sendAdminContactNotification = async (
  name: string,
  email: string,
  phone: string,
  subject: string,
  message: string
) =>
  transporter.sendMail({
    ...baseDetails,
    to: username,
    subject: `New contact form submission: ${subject || 'General inquiry'}`,
    text: `Name: ${name}
Email: ${email}
Phone: ${phone || 'n/a'}
Subject: ${subject || 'n/a'}
Message: ${message}`,
  });

export const sendAdminPasswordResetEmail = async (to: string, resetUrl: string) =>
  transporter.sendMail({
    ...baseDetails,
    to,
    subject: 'Admin password reset request',
    html: `
      <p>You requested to reset your admin password.</p>
      <p>Click the link below to set a new password (valid for 30 minutes):</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you did not request this, please ignore this email.</p>
    `,
  });
