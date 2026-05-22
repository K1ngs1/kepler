'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ShippingAddress {
  id: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  is_default: boolean;
}

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Shipping address state
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ShippingAddress | null>(null);
  const [addrForm, setAddrForm] = useState({ name: '', street: '', city: '', state: '', zip: '', country: 'US' });
  const [addrSaving, setAddrSaving] = useState(false);

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

      // Load shipping addresses
      const { data: addrs } = await supabase
        .from('shipping_addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false });
      if (addrs) setAddresses(addrs);

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

  const handleSaveAddress = async () => {
    if (!addrForm.name || !addrForm.street || !addrForm.city || !addrForm.state || !addrForm.zip) {
      setToast('Please fill in all address fields.');
      return;
    }
    setAddrSaving(true);
    const supabase = createClient();
    if (!supabase) { setAddrSaving(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAddrSaving(false); return; }

    if (editingAddress) {
      const { error } = await supabase
        .from('shipping_addresses')
        .update({ ...addrForm, updated_at: new Date().toISOString() })
        .eq('id', editingAddress.id);
      if (error) { setToast('Failed to update address.'); setAddrSaving(false); return; }
    } else {
      const isDefault = addresses.length === 0;
      const { error } = await supabase
        .from('shipping_addresses')
        .insert({ ...addrForm, user_id: user.id, is_default: isDefault });
      if (error) { setToast('Failed to save address.'); setAddrSaving(false); return; }
    }

    // Reload addresses
    const { data: addrs } = await supabase
      .from('shipping_addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false });
    if (addrs) setAddresses(addrs);

    setAddrForm({ name: '', street: '', city: '', state: '', zip: '', country: 'US' });
    setShowAddressForm(false);
    setEditingAddress(null);
    setAddrSaving(false);
    setToast(editingAddress ? 'Address updated!' : 'Address added!');
  };

  const handleSetDefault = async (addrId: string) => {
    const supabase = createClient();
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Unset all defaults, then set this one
    await supabase.from('shipping_addresses').update({ is_default: false }).eq('user_id', user.id);
    await supabase.from('shipping_addresses').update({ is_default: true }).eq('id', addrId);

    const { data: addrs } = await supabase
      .from('shipping_addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false });
    if (addrs) setAddresses(addrs);
  };

  const handleDeleteAddress = async (addrId: string) => {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from('shipping_addresses').delete().eq('id', addrId);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: addrs } = await supabase
      .from('shipping_addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false });
    if (addrs) setAddresses(addrs);
    setToast('Address removed.');
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420, maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-title">Settings</div>
        <div className="modal-sub">Manage your preferences and shipping info.</div>

        {loading ? (
          <div style={{ padding: '20px 0', color: '#aaa', fontSize: 13, textAlign: 'center' }}>Loading...</div>
        ) : (
          <>
            {/* ── Notifications ── */}
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

            {/* ── Shipping Addresses ── */}
            <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>Shipping Addresses</div>
                {!showAddressForm && (
                  <button
                    className="btn-outline-ext"
                    style={{ width: 'auto', padding: '5px 12px', fontSize: 12, marginTop: 0 }}
                    onClick={() => { setShowAddressForm(true); setEditingAddress(null); setAddrForm({ name: '', street: '', city: '', state: '', zip: '', country: 'US' }); }}
                  >
                    + Add Address
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: '#888', marginBottom: 12 }}>
                Your address is only shared with trade participants after acceptance.
              </div>

              {/* Existing addresses */}
              {addresses.map((addr) => (
                <div key={addr.id} style={{ padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: 6, marginBottom: 8, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
                        {addr.name}
                        {addr.is_default && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#3db56c', marginLeft: 8, textTransform: 'uppercase' }}>Default</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#555', marginTop: 2, lineHeight: 1.5 }}>
                        {addr.street}<br />
                        {addr.city}, {addr.state} {addr.zip}<br />
                        {addr.country}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {!addr.is_default && (
                        <button
                          onClick={() => handleSetDefault(addr.id)}
                          style={{ background: 'none', border: 'none', fontSize: 11, color: '#555', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Set Default
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingAddress(addr);
                          setAddrForm({ name: addr.name, street: addr.street, city: addr.city, state: addr.state, zip: addr.zip, country: addr.country });
                          setShowAddressForm(true);
                        }}
                        style={{ background: 'none', border: 'none', fontSize: 11, color: '#555', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteAddress(addr.id)}
                        style={{ background: 'none', border: 'none', fontSize: 11, color: '#c0392b', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {addresses.length === 0 && !showAddressForm && (
                <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '8px 0' }}>No addresses saved yet.</div>
              )}

              {/* Address form */}
              {showAddressForm && (
                <div style={{ padding: '12px', border: '1px solid #e5e5e5', borderRadius: 6, background: '#fafafa', marginBottom: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10, color: '#111' }}>
                    {editingAddress ? 'Edit Address' : 'New Address'}
                  </div>
                  <label className="login-field-label">Full Name</label>
                  <input className="login-field-input" value={addrForm.name} onChange={(e) => setAddrForm({ ...addrForm, name: e.target.value })} placeholder="John Doe" />
                  <label className="login-field-label">Street Address</label>
                  <input className="login-field-input" value={addrForm.street} onChange={(e) => setAddrForm({ ...addrForm, street: e.target.value })} placeholder="123 Main St, Apt 4B" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label className="login-field-label">City</label>
                      <input className="login-field-input" value={addrForm.city} onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })} placeholder="New York" />
                    </div>
                    <div>
                      <label className="login-field-label">State</label>
                      <input className="login-field-input" value={addrForm.state} onChange={(e) => setAddrForm({ ...addrForm, state: e.target.value })} placeholder="NY" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label className="login-field-label">ZIP Code</label>
                      <input className="login-field-input" value={addrForm.zip} onChange={(e) => setAddrForm({ ...addrForm, zip: e.target.value })} placeholder="10001" />
                    </div>
                    <div>
                      <label className="login-field-label">Country</label>
                      <input className="login-field-input" value={addrForm.country} onChange={(e) => setAddrForm({ ...addrForm, country: e.target.value })} placeholder="US" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button className="modal-cancel" style={{ flex: 1 }} onClick={() => { setShowAddressForm(false); setEditingAddress(null); }}>Cancel</button>
                    <button className="modal-confirm" style={{ flex: 2 }} onClick={handleSaveAddress} disabled={addrSaving}>
                      {addrSaving ? 'Saving...' : editingAddress ? 'Update' : 'Save Address'}
                    </button>
                  </div>
                </div>
              )}
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
