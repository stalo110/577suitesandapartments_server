import { Request, Response } from 'express';
import { ContactMessage } from '../models/ContactMessageModel';
import { sendAdminContactNotification, sendContactAcknowledgementEmail } from '../utils/mailer';

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

export const getContactMessages = async (_req: Request, res: Response) => {
  try {
    const messages = await ContactMessage.findAll({ order: [['createdAt', 'DESC']] });
    return res.status(200).json(
      messages.map((message) => ({
        id: String(message.id),
        name: message.name,
        email: message.email,
        phone: message.phone,
        subject: message.subject,
        message: message.message,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      }))
    );
  } catch (error) {
    console.error('Failed to fetch contact messages:', error);
    return res.status(500).json({ error: 'Unable to fetch contact messages' });
  }
};
