'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      if (!supabase) { setLoading(false); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      setEmail(user.email ?? '');

      const { data: profile } = await supabase
        .from('profiles')
        .select('email_notifications')
        .eq('id', user.id)
        .single();

      if (profile) {
        setEmailNotifications(profile.email_notifications ?? false);
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    if (!supabase) { setSaving(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase
      .from('profiles')
      .update({ email_notifications: emailNotifications })
      .eq('id', user.id);

    setSaving(false);
    if (error) {
      setToast('Failed to save settings.');
    } else {
      setToast('Settings saved!');
      setTimeout(() => onClose(), 1000);
    }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <div className="modal-title">Settings</div>
        <div className="modal-sub">Manage your notification preferences.</div>

        {loading ? (
          <div style={{ padding: '20px 0', color: '#aaa', fontSize: 13, textAlign: 'center' }}>Loading...</div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label className="modal-label">Email</label>
              <div style={{ fontSize: 13, color: '#555', padding: '8px 0' }}>{email || 'No email on file'}</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 2 }}>Email Notifications</div>
                <div style={{ fontSize: 11.5, color: '#888' }}>Get notified about new trade offers and messages</div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={() => setEmailNotifications(!emailNotifications)}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {toast && (
              <div style={{ fontSize: 12.5, color: toast.includes('Failed') ? '#c0392b' : '#3db56c', fontWeight: 600, marginBottom: 12 }}>
                {toast}
              </div>
            )}

            <div className="modal-btns">
              <button className="modal-cancel" onClick={onClose}>Cancel</button>
              <button className="modal-confirm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
