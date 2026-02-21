import { Request, Response } from 'express';
import { ContactMessage } from '../models/ContactMessageModel';
import {
  sendAdminContactNotification,
  sendContactAcknowledgementEmail,
  sendContactReplyEmail,
} from '../utils/mailer';

type ContactMessageStatus = 'read' | 'unread';

const CONTACT_MESSAGE_STATUSES = new Set<ContactMessageStatus>(['read', 'unread']);

type AuthenticatedRequest = Request & {
  user?: {
    email?: string;
  };
};

const serializeContactMessage = (message: ContactMessage) => ({
  id: String(message.id),
  name: message.name,
  email: message.email,
  phone: message.phone,
  subject: message.subject,
  message: message.message,
  status: message.status || 'unread',
  adminReply: message.adminReply || null,
  adminRepliedAt: message.adminRepliedAt || null,
  adminRepliedBy: message.adminRepliedBy || null,
  createdAt: message.createdAt,
  updatedAt: message.updatedAt,
});

export const submitContactForm = async (req: Request, res: Response) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required' });
  }

  try {
    const record = await ContactMessage.create({
      name,
      email,
      phone: phone || null,
      subject: subject || null,
      message,
      status: 'unread',
    });

    await Promise.all([
      sendContactAcknowledgementEmail(email, name),
      sendAdminContactNotification(name, email, phone || '', subject || '', message),
    ]);

    return res.status(200).json({
      message: 'Message delivered successfully',
      contactId: String(record.id),
    });
  } catch (error) {
    console.error('Failed to deliver contact emails:', error);
    return res.status(500).json({ error: 'Unable to send your message right now' });
  }
};

export const getContactMessages = async (req: Request, res: Response) => {
  const requestedStatus =
    typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';
  const statusFilter = CONTACT_MESSAGE_STATUSES.has(requestedStatus as ContactMessageStatus)
    ? (requestedStatus as ContactMessageStatus)
    : null;

  try {
    const messages = await ContactMessage.findAll({
      where: statusFilter ? { status: statusFilter } : undefined,
      order: [['createdAt', 'DESC']],
    });
    return res.status(200).json(messages.map(serializeContactMessage));
  } catch (error) {
    console.error('Failed to fetch contact messages:', error);
    return res.status(500).json({ error: 'Unable to fetch contact messages' });
  }
};

export const updateContactMessageStatus = async (req: Request, res: Response) => {
  const messageId = Number(req.params.id);
  const requestedStatus =
    typeof req.body.status === 'string' ? req.body.status.trim().toLowerCase() : '';

  if (!Number.isInteger(messageId) || messageId <= 0) {
    return res.status(400).json({ error: 'A valid message id is required' });
  }

  if (!CONTACT_MESSAGE_STATUSES.has(requestedStatus as ContactMessageStatus)) {
    return res.status(400).json({ error: 'Status must be either "read" or "unread"' });
  }

  try {
    const message = await ContactMessage.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    message.status = requestedStatus as ContactMessageStatus;
    await message.save();

    return res.status(200).json({
      message: `Message marked as ${requestedStatus}`,
      data: serializeContactMessage(message),
    });
  } catch (error) {
    console.error('Failed to update contact message status:', error);
    return res.status(500).json({ error: 'Unable to update message status' });
  }
};

export const replyToContactMessage = async (req: AuthenticatedRequest, res: Response) => {
  const messageId = Number(req.params.id);
  const reply =
    typeof req.body.reply === 'string'
      ? req.body.reply.trim()
      : typeof req.body.message === 'string'
        ? req.body.message.trim()
        : '';

  if (!Number.isInteger(messageId) || messageId <= 0) {
    return res.status(400).json({ error: 'A valid message id is required' });
  }

  if (!reply) {
    return res.status(400).json({ error: 'Reply message is required' });
  }

  try {
    const message = await ContactMessage.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await sendContactReplyEmail(
      message.email,
      message.name,
      message.subject || 'Your inquiry at 517 VIP Suites',
      reply
    );

    message.adminReply = reply;
    message.adminRepliedAt = new Date();
    message.adminRepliedBy = req.user?.email || null;
    message.status = 'read';
    await message.save();

    return res.status(200).json({
      message: 'Reply sent successfully',
      data: serializeContactMessage(message),
    });
  } catch (error) {
    console.error('Failed to send contact reply:', error);
    return res.status(500).json({ error: 'Unable to send reply right now' });
  }
};
