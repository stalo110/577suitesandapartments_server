import { Request, Response } from 'express';
import { sendAdminContactNotification, sendContactAcknowledgementEmail } from '../utils/mailer';

export const submitContactForm = async (req: Request, res: Response) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required' });
  }

  try {
    await Promise.all([
      sendContactAcknowledgementEmail(email, name),
      sendAdminContactNotification(name, email, phone || '', subject || '', message),
    ]);

    return res.status(200).json({ message: 'Message delivered successfully' });
  } catch (error) {
    console.error('Failed to deliver contact emails:', error);
    return res.status(500).json({ error: 'Unable to send your message right now' });
  }
};
