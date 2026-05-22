'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  read: boolean;
  sent_at: string;
}

interface Props {
  listingId: string;
  sellerId: string;
  sellerName: string;
  open: boolean;
  onClose: () => void;
}

export default function ListingMessages({ listingId, sellerId, sellerName, open, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Check auth
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // Load messages & subscribe
  const loadMessages = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    if (!supabase) return;

    setLoading(true);
    const { data } = await supabase
      .from('listing_messages')
      .select('id, sender_id, recipient_id, content, read, sent_at')
      .eq('listing_id', listingId)
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('sent_at', { ascending: true });

    if (data) {
      setMessages(data as unknown as Message[]);
    }
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [listingId, userId]);

  useEffect(() => {
    if (!userId) return;
    loadMessages();

    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase.channel(`listing-msgs-${listingId}-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'listing_messages',
        filter: `listing_id=eq.${listingId}`,
      }, () => loadMessages())
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [listingId, userId, loadMessages]);

  // Mark messages as read when panel opens
  useEffect(() => {
    if (!open || !userId) return;
    const supabase = createClient();
    if (!supabase) return;

    const unreadIds = messages
      .filter(m => m.recipient_id === userId && !m.read)
      .map(m => m.id);

    if (unreadIds.length > 0) {
      supabase.from('listing_messages')
        .update({ read: true })
        .in('id', unreadIds)
        .then(() => {
          setMessages(prev => prev.map(m =>
            unreadIds.includes(m.id) ? { ...m, read: true } : m
          ));
        });
    }
  }, [open, userId, messages]);

  const sendMessage = async () => {
    if (!msgInput.trim() || !userId || sending) return;
    const supabase = createClient();
    if (!supabase) return;

    setSending(true);
    const recipientId = userId === sellerId ? messages.find(m => m.sender_id !== sellerId)?.sender_id || '' : sellerId;

    if (!recipientId) {
      await supabase.from('listing_messages').insert({
        listing_id: listingId,
        sender_id: userId,
        recipient_id: sellerId,
        content: msgInput.trim(),
      });
    } else {
      await supabase.from('listing_messages').insert({
        listing_id: listingId,
        sender_id: userId,
        recipient_id: recipientId,
        content: msgInput.trim(),
      });
    }

    setMsgInput('');
    setSending(false);
    await loadMessages();
  };

  if (!open || !userId) return null;

  const isSeller = userId === sellerId;

  const fmtTime = (s: string) => {
    const d = new Date(s);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="listing-chat-panel" onClick={(e) => e.stopPropagation()}>
        <div className="listing-chat-header">
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>
              {isSeller ? 'Buyer Messages' : `Chat with ${sellerName}`}
            </div>
            <div style={{ fontSize: 11, color: '#999' }}>About this listing</div>
          </div>
          <button
            onClick={onClose}
            className="listing-chat-close"
            aria-label="Close messages"
          >
            ✕
          </button>
        </div>

        <div className="listing-chat-body">
          {loading && messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#ccc', fontSize: 12, marginTop: 40 }}>Loading…</div>
          )}
          {!loading && messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
              <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>
                {isSeller
                  ? 'No messages yet. Buyers can message you here.'
                  : `Send a message to ${sellerName} about this listing.`}
              </div>
            </div>
          )}
          {messages.map((msg) => {
            const isMe = msg.sender_id === userId;
            return (
              <div key={msg.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div
                  className={isMe ? 'listing-msg-bubble listing-msg-mine' : 'listing-msg-bubble listing-msg-theirs'}
                >
                  {msg.content}
                </div>
                <div style={{
                  fontSize: 10, color: '#bbb', marginTop: 3, marginBottom: 6,
                  textAlign: isMe ? 'right' : 'left',
                  paddingLeft: isMe ? 0 : 4,
                  paddingRight: isMe ? 4 : 0,
                }}>
                  {fmtTime(msg.sent_at)}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="listing-chat-input-area">
          <input
            className="listing-chat-input"
            placeholder="Type a message…"
            value={msgInput}
            onChange={(e) => setMsgInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            disabled={sending}
          />
          <button
            className="listing-chat-send"
            onClick={sendMessage}
            disabled={sending || !msgInput.trim()}
            aria-label="Send message"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
