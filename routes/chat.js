const express = require('express');
const crypto = require('crypto');
const Message = require('../models/Message');
const User = require('../models/User');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Helper: generate consistent conversation ID between two users
function getConversationId(userId1, userId2) {
  const sorted = [userId1.toString(), userId2.toString()].sort();
  return `${sorted[0]}_${sorted[1]}`;
}

// Get all conversations for the current user
router.get('/conversations', auth, async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get all unique conversations involving this user
    const conversations = await Message.aggregate([
      { $match: { $or: [{ sender: userId }, { receiver: userId }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$conversationId',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [{ $and: [{ $eq: ['$receiver', userId] }, { $eq: ['$read', false] }] }, 1, 0]
            }
          }
        }
      },
      { $sort: { 'lastMessage.createdAt': -1 } }
    ]);

    // Get hidden conversations for this user
    const currentUser = await User.findById(userId).select('hiddenConversations blockedUsers');
    const hiddenIds = (currentUser.hiddenConversations || []).map(id => id.toString());

    // Populate user info for each conversation
    const populated = await Promise.all(
      conversations.map(async (conv) => {
        const otherUserId = conv.lastMessage.sender.toString() === userId.toString()
          ? conv.lastMessage.receiver
          : conv.lastMessage.sender;
        // Skip hidden conversations
        if (hiddenIds.includes(otherUserId.toString())) return null;
        const otherUser = await User.findById(otherUserId).select('firstName lastName role avatar avatar');

        return {
          conversationId: conv._id,
          otherUser,
          lastMessage: {
            content: conv.lastMessage.content,
            createdAt: conv.lastMessage.createdAt,
            sender: conv.lastMessage.sender,
            attachments: conv.lastMessage.attachments || [],
          },
          unreadCount: conv.unreadCount,
        };
      })
    );

    // Filter out nulls (hidden conversations)
    res.json({ success: true, conversations: populated.filter(Boolean) });
  } catch (error) {
    next(error);
  }
});

// Get messages in a conversation
router.get('/messages/:conversationId', auth, async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verify user is part of this conversation
    const userId = req.user._id.toString();
    const [user1, user2] = conversationId.split('_');
    if (userId !== user1 && userId !== user2) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const messages = await Message.find({ conversationId })
      .populate('sender', 'firstName lastName avatar role')
      .populate('receiver', 'firstName lastName avatar role')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    res.json({ success: true, messages: messages.reverse() });
  } catch (error) {
    next(error);
  }
});

// Send a message (supports text + attachments: images, voice, documents)
router.post('/send', auth, async (req, res, next) => {
  try {
    const { receiverId, content, attachments } = req.body;

    if (!receiverId) {
      return res.status(400).json({ success: false, message: 'Destinataire requis' });
    }

    if ((!content || content.trim() === '') && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ success: false, message: 'Contenu ou pièce jointe requis' });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ success: false, message: 'Destinataire non trouvé' });
    }

    const conversationId = getConversationId(req.user._id, receiverId);

    const messageData = {
      sender: req.user._id,
      receiver: receiverId,
      conversationId,
      content: content || '',
    };

    // Handle attachments (images, voice, documents)
    if (attachments && attachments.length > 0) {
      messageData.attachments = attachments.map((att, i) => ({
        type: att.type, // 'image' | 'voice' | 'document'
        url: att.url,
        name: att.name || `file-${i}`,
        size: att.size || 0,
        duration: att.duration || 0, // for voice messages
        mimeType: att.mimeType || '',
      }));
    }

    const message = await Message.create(messageData);

    const populated = await Message.findById(message._id)
      .populate('sender', 'firstName lastName avatar role')
      .populate('receiver', 'firstName lastName avatar role');

    // Emit via Socket.IO to conversation room + receiver
    const io = req.app.get('io');
    if (io) {
      io.to(`conv:${conversationId}`).emit('new-message', populated);
      io.to(`user:${receiverId}`).emit('new-message', populated);
      io.to(`user:${req.user._id}`).emit('new-message', populated);
    }

    res.status(201).json({ success: true, message: populated });
  } catch (error) {
    next(error);
  }
});

// Edit a message
router.put('/messages/:messageId', auth, async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ success: false, message: 'Contenu requis' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message non trouvé' });
    }

    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Vous ne pouvez modifier que vos propres messages' });
    }

    message.content = content.trim();
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    const populated = await Message.findById(message._id)
      .populate('sender', 'firstName lastName avatar role')
      .populate('receiver', 'firstName lastName avatar role');

    // Notify via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`conv:${message.conversationId}`).emit('message-edited', populated);
    }

    res.json({ success: true, message: populated });
  } catch (error) {
    next(error);
  }
});

// Delete a message
router.delete('/messages/:messageId', auth, async (req, res, next) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message non trouvé' });
    }

    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Vous ne pouvez supprimer que vos propres messages' });
    }

    await Message.findByIdAndDelete(messageId);

    // Notify via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`conv:${message.conversationId}`).emit('message-deleted', { messageId, conversationId: message.conversationId });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Mark messages as read
router.post('/read/:conversationId', auth, async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    await Message.updateMany(
      { conversationId, receiver: req.user._id, read: false },
      { read: true, readAt: new Date() }
    );

    // Notify the other user that messages were read
    const io = req.app.get('io');
    if (io) {
      const [user1, user2] = conversationId.split('_');
      const otherUserId = user1 === req.user._id.toString() ? user2 : user1;
      io.to(`user:${otherUserId}`).emit('messages-read', { conversationId, readBy: req.user._id });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// === QR CODE LINKING FOR CLIENT-TO-CLIENT CHAT ===

// Generate a QR code token for linking
router.post('/qr/generate', auth, async (req, res, next) => {
  try {
    const userId = req.user._id;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store in a simple in-memory cache (production: use Redis)
    if (!global.qrTokens) global.qrTokens = {};
    global.qrTokens[token] = { userId: userId.toString(), expiresAt };

    // Cleanup expired tokens
    for (const [key, val] of Object.entries(global.qrTokens)) {
      if (val.expiresAt < new Date()) delete global.qrTokens[key];
    }

    res.json({ success: true, token, expiresAt });
  } catch (error) {
    next(error);
  }
});

// Scan a QR code token to link two users for chat
router.post('/qr/scan', auth, async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Token requis' });
    }

    if (!global.qrTokens || !global.qrTokens[token]) {
      return res.status(400).json({ success: false, message: 'QR code invalide ou expiré' });
    }

    const qrData = global.qrTokens[token];

    if (qrData.expiresAt < new Date()) {
      delete global.qrTokens[token];
      return res.status(400).json({ success: false, message: 'QR code expiré' });
    }

    if (qrData.userId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez pas vous connecter à vous-même' });
    }

    const otherUser = await User.findById(qrData.userId).select('firstName lastName role avatar');

    // Delete used token
    delete global.qrTokens[token];

    // Create a welcome message to establish the conversation
    const conversationId = getConversationId(req.user._id, qrData.userId);
    const existingMessages = await Message.countDocuments({ conversationId });

    if (existingMessages === 0) {
      await Message.create({
        sender: qrData.userId,
        receiver: req.user._id,
        conversationId,
        content: `Hey ! 👋 On est connectés. Discutons !`,
      });
    }

    res.json({ success: true, user: otherUser, conversationId });
  } catch (error) {
    next(error);
  }
});

// Get admin info (for partner to start a conversation)
router.get('/admin-info', auth, requireRole('partner_owner', 'partner_manager', 'user'), async (req, res, next) => {
  try {
    const admin = await User.findOne({ role: { $in: ['admin', 'super_admin'] } })
      .select('firstName lastName role avatar');
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Aucun admin trouvé' });
    }
    res.json({ success: true, admin });
  } catch (error) {
    next(error);
  }
});

// Delete all messages in a conversation (clear chat)
router.delete('/conversation/:conversationId', auth, async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();
    const [user1, user2] = conversationId.split('_');
    if (userId !== user1 && userId !== user2) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const result = await Message.deleteMany({ conversationId });

    const io = req.app.get('io');
    if (io) {
      const otherUserId = user1 === userId ? user2 : user1;
      io.to(`conv:${conversationId}`).emit('conversation-cleared', { conversationId });
      io.to(`user:${otherUserId}`).emit('conversation-cleared', { conversationId });
    }

    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    next(error);
  }
});

// Block a user
router.post('/block/:userId', auth, async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!req.user.blockedUsers) req.user.blockedUsers = [];
    const isBlocked = req.user.blockedUsers.includes(userId);
    if (isBlocked) {
      req.user.blockedUsers = req.user.blockedUsers.filter((id) => id.toString() !== userId);
    } else {
      req.user.blockedUsers.push(userId);
    }
    await req.user.save();
    res.json({ success: true, blocked: !isBlocked });
  } catch (error) {
    next(error);
  }
});

// Delete conversation from list (hide for this user)
router.delete('/conversation/:conversationId/hide', auth, async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();
    const [user1, user2] = conversationId.split('_');
    if (userId !== user1 && userId !== user2) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }
    const otherUserId = user1 === userId ? user2 : user1;
    if (!req.user.hiddenConversations) req.user.hiddenConversations = [];
    if (!req.user.hiddenConversations.includes(otherUserId)) {
      req.user.hiddenConversations.push(otherUserId);
      await req.user.save();
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Generate invitation link (for remote connection)
router.post('/generate-invitation-link', auth, async (req, res, next) => {
  try {
    // Generate a unique token for this invitation
    const token = crypto.randomBytes(32).toString('hex');
    
    // Store token with user info and expiry (5 minutes)
    if (!global.invitationTokens) global.invitationTokens = {};
    global.invitationTokens[token] = {
      userId: req.user._id,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
    };
    
    // Generate the full link
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const invitationLink = `${baseUrl}/chat?invite=${token}`;
    
    res.json({ success: true, token, link: invitationLink });
  } catch (error) {
    next(error);
  }
});

// Accept invitation link (for remote connection)
router.post('/accept-invitation-link', auth, async (req, res, next) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token manquant' });
    }
    
    // Check if token exists and is valid
    if (!global.invitationTokens || !global.invitationTokens[token]) {
      return res.status(400).json({ success: false, message: 'Lien invalide ou expiré' });
    }
    
    const invitationData = global.invitationTokens[token];
    
    // Check if token is expired
    if (Date.now() > invitationData.expiresAt) {
      delete global.invitationTokens[token];
      return res.status(400).json({ success: false, message: 'Lien expiré' });
    }
    
    // Check if user is trying to invite themselves
    if (invitationData.userId.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez pas vous inviter vous-même' });
    }
    
    // Get the inviter's info
    const inviter = await User.findById(invitationData.userId)
      .select('firstName lastName role avatar');
    
    if (!inviter) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }
    
    // Delete used token
    delete global.invitationTokens[token];
    
    // Create a welcome message to establish the conversation
    const conversationId = getConversationId(req.user._id, inviter._id);
    const existingMessages = await Message.countDocuments({ conversationId });
    
    if (existingMessages === 0) {
      await Message.create({
        sender: inviter._id,
        receiver: req.user._id,
        conversationId,
        content: `Hey ! 👋 On est connectés via lien d'invitation. Discutons !`,
      });
    }
    
    res.json({ success: true, user: inviter, conversationId });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
