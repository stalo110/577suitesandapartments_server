import { Request, Response } from 'express';
import { Guest } from '../models/guestmodel.js';
import { Event } from '../models/eventmodel.js';
import { WhatsAppMessage } from '../models/WhatsAppMessage.js';
import whatsappService from '../utils/whatsappService.js';

export const sendBulkWhatsApp = async (req: Request, res: Response) => {
  try {
    const { eventId, templateName = 'event_invitation', guestIds } = req.body;

    if (!eventId) {
      return res.status(400).json({ message: 'Event ID is required' });
    }

    const eventDoc = await Event.findById(eventId);
    if (!eventDoc) {
      return res.status(404).json({ message: 'Event not found' });
    }

    let guestQuery: any = { eventId, phone: { $exists: true, $ne: "" } };
    if (guestIds && guestIds.length > 0) {
      guestQuery._id = { $in: guestIds };
    }

    const guests = await Guest.find(guestQuery);
    if (!guests.length) {
      return res.status(404).json({ message: 'No guests with phone numbers found' });
    }

    console.log(`📱 Sending WhatsApp to ${guests.length} guests`);

    const guestsData = guests.map(g => ({
      _id: g._id.toString(),
      fullname: g.fullname,
      phone: g.phone,
      qrCode: g.qrCode
    }));

    const eventData = {
      _id: (eventDoc._id as any).toString(),
      name: eventDoc.name,
      location: eventDoc.location,
      date: eventDoc.date
    };

    const result = await whatsappService.sendBulkMessages(guestsData, eventData, templateName);

    res.json({
      message: 'WhatsApp bulk send completed',
      ...result
    });

  } catch (error: any) {
    console.error('Bulk WhatsApp error:', error);
    res.status(500).json({ 
      message: 'Failed to send WhatsApp messages', 
      error: error.message 
    });
  }
};

export const sendSingleWhatsApp = async (req: Request, res: Response) => {
  try {
    const { guestId, templateName = 'event_invitation' } = req.body;

    if (!guestId) {
      return res.status(400).json({ message: 'Guest ID is required' });
    }

    const guest = await Guest.findById(guestId);
    if (!guest) {
      return res.status(404).json({ message: 'Guest not found' });
    }

    if (!guest.phone) {
      return res.status(400).json({ message: 'Guest has no phone number' });
    }

    const eventDoc = await Event.findById(guest.eventId);
    if (!eventDoc) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const templateParams = [
      guest.fullname,
      eventDoc.name,
      eventDoc.location || 'TBA',
      eventDoc.date || 'TBA',
      guest.qrCode?.includes('.png') 
        ? guest.qrCode 
        : `https://292x833w13.execute-api.us-east-2.amazonaws.com/guest/download-emailcode/${guest._id}`
    ];

    const result = await whatsappService.sendTemplateMessage(
      guest.phone,
      templateName,
      templateParams,
      guest._id.toString(),
      (eventDoc._id as any).toString()
    );

    if (result.success) {
      res.json({
        message: 'WhatsApp message sent successfully',
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        message: 'Failed to send WhatsApp message',
        error: result.error
      });
    }

  } catch (error: any) {
    console.error('Single WhatsApp error:', error);
    res.status(500).json({ 
      message: 'Failed to send WhatsApp message', 
      error: error.message 
    });
  }
};

export const getWhatsAppStatus = async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({ message: 'Event ID is required' });
    }

    const stats = await whatsappService.getMessageStats(eventId);
    
    const messages = await WhatsAppMessage.find({ eventId })
      .populate('guestId', 'fullname phone')
      .sort({ sentAt: -1 })
      .limit(100)
      .lean()
      .exec() as any[];

    res.json({
      stats,
      messages: messages.map((msg: any) => ({
        id: msg._id,
        guestName: msg.guestId?.fullname || 'Unknown',
        phoneNumber: msg.phoneNumber,
        status: msg.status,
        templateName: msg.templateName,
        sentAt: msg.sentAt,
        deliveredAt: msg.deliveredAt,
        readAt: msg.readAt,
        errorMessage: msg.errorMessage
      }))
    });

  } catch (error: any) {
    console.error('WhatsApp status error:', error);
    res.status(500).json({ 
      message: 'Failed to get WhatsApp status', 
      error: error.message 
    });
  }
};

export const handleWhatsAppWebhook = async (req: Request, res: Response) => {
  try {
    const { entry } = req.body;

    if (!entry || !entry[0]?.changes) {
      return res.status(200).send('OK');
    }

    for (const change of entry[0].changes) {
      if (change.field === 'messages') {
        const { statuses } = change.value;
        
        if (statuses) {
          for (const status of statuses) {
            await whatsappService.updateMessageStatus(
              status.id,
              status.status,
              status.timestamp
            );
          }
        }
      }
    }

    res.status(200).send('OK');

  } catch (error: any) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const verifyWhatsAppWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
};