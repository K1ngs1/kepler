'use client';

import { useState, useEffect } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useParams } from 'next/navigation';

interface CardEntry {
  card_name: string;
  set_name: string;
  condition: string;
  custom_price: string;
}

interface ExistingPhoto {
  id: string;
  url: string;
}

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [tradePreferences, setTradePreferences] = useState('');

  const [cards, setCards] = useState<CardEntry[]>([]);

  // Photos state
  const [existingPhotos, setExistingPhotos] = useState<ExistingPhoto[]>([]);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newPhotoPreviews, setNewPhotoPreviews] = useState<string[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);

  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authed, setAuthed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !id) return;

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setPageLoading(false);
        return;
      }
      setAuthed(true);
      setUserId(user.id);

      // Fetch Listing
      const { data: listing, error: listingError } = await supabase
        .from('listings')
        .select('*')
        .eq('id', id)
        .single();

      if (listingError || !listing) {
        setError('Listing not found.');
        setPageLoading(false);
        return;
      }

      if (listing.seller_id !== user.id) {
        setError('You do not have permission to edit this listing.');
        setPageLoading(false);
        return;
      }

      setTitle(listing.title || '');
      setDescription(listing.description || '');
      setPriceMin(listing.price_min ? listing.price_min.toString() : '');
      setPriceMax(listing.price_max ? listing.price_max.toString() : '');
      setTradePreferences(listing.trade_preferences || '');

      // Fetch Items
      const { data: items } = await supabase
        .from('listing_items')
        .select('*')
        .eq('listing_id', id);

      if (items) {
        setCards(items.map(item => ({
          card_name: item.card_name || '',
          set_name: item.set_name || '',
          condition: item.condition_text || 'NM',
          custom_price: item.custom_price ? item.custom_price.toString() : ''
        })));
      }

      // Fetch Photos
      const { data: photos } = await supabase
        .from('listing_photos')
        .select('id, url')
        .eq('listing_id', id)
        .order('sort_order', { ascending: true });

      if (photos) {
        setExistingPhotos(photos.map(p => ({ id: p.id, url: p.url })));
      }

      setPageLoading(false);
    });
  }, [id]);

  const addCard = () => {
    setCards([...cards, { card_name: '', set_name: '', condition: 'NM', custom_price: '' }]);
  };

  const updateCard = (index: number, field: keyof CardEntry, value: string) => {
    const updated = [...cards];
    updated[index][field] = value;
    setCards(updated);
  };

  const removeCard = (index: number) => {
    setCards(cards.filter((_, i) => i !== index));
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const previews = files.map(f => URL.createObjectURL(f));
    setNewPhotos(prev => [...prev, ...files]);
    setNewPhotoPreviews(prev => [...prev, ...previews]);
  };

  const removeExistingPhoto = (photoId: string) => {
    setRemovedPhotoIds(prev => [...prev, photoId]);
    setExistingPhotos(prev => prev.filter(p => p.id !== photoId));
  };

  const removeNewPhoto = (index: number) => {
    setNewPhotos(prev => prev.filter((_, i) => i !== index));
    setNewPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title) { setError('Title is required'); return; }

    setLoading(true);
    setError('');
    const supabase = createClient();
    if (!supabase || !userId) return;

    try {
      const pMin = priceMin ? parseFloat(priceMin) : null;
      const pMax = priceMax ? parseFloat(priceMax) : null;

      // 1. Update listing details
      const { error: listingError } = await supabase
        .from('listings')
        .update({
          title,
          description,
          price_min: pMin,
          price_max: pMax,
          trade_preferences: tradePreferences,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('seller_id', userId);

      if (listingError) throw listingError;

      // 2. Handle photos
      // Delete removed photos
      if (removedPhotoIds.length > 0) {
        await supabase.from('listing_photos').delete().in('id', removedPhotoIds);
      }

      // Upload new photos
      const uploadedUrls: string[] = [];
      for (let i = 0; i < newPhotos.length; i++) {
        const file = newPhotos[i];
        const path = `listings/${id}/${Date.now()}-${i}`;
        const { error: uploadError } = await supabase.storage
          .from('card-photos')
          .upload(path, file, { contentType: file.type });

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('card-photos').getPublicUrl(path);
          const url = urlData.publicUrl;
          uploadedUrls.push(url);
          await supabase.from('listing_photos').insert({
            listing_id: id,
            url,
            sort_order: existingPhotos.length + i // Append to end
          });
        }
      }

      // Update cover photo if needed
      const allFinalUrls = [...existingPhotos.map(p => p.url), ...uploadedUrls];
      if (allFinalUrls.length > 0) {
        await supabase.from('listings').update({ cover_photo_url: allFinalUrls[0] }).eq('id', id);
      } else {
        await supabase.from('listings').update({ cover_photo_url: null }).eq('id', id);
      }

      // 3. Handle cards
      // Delete all current items
      await supabase.from('listing_items').delete().eq('listing_id', id);

      // Insert updated items
      for (const card of cards) {
        if (!card.card_name.trim()) continue;
        const cPrice = card.custom_price ? parseFloat(card.custom_price) : null;

        const { error: itemError } = await supabase
          .from('listing_items')
          .insert({
            listing_id: id,
            card_name: card.card_name.trim(),
            set_name: card.set_name.trim() || null,
            condition_text: card.condition,
            custom_price: cPrice
          });

        if (itemError) throw itemError;
      }

      router.push(`/listings/${id}`);
    } catch (err: any) {
      setError(err.message || 'Error updating listing');
      setLoading(false);
    }
  };

  if (pageLoading) {
    return <><Nav /><div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa', fontSize: 13 }}>Loading listing...</div><Footer /></>;
  }

  if (!authed) {
    return <><Nav /><div style={{ textAlign: 'center', padding: '80px 0', color: '#888', fontSize: 14 }}>Please sign in to edit this listing.</div><Footer /></>;
  }

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px' }}>
        <div className="listing-toolbar" style={{ marginBottom: 24 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 13, color: '#777', cursor: 'pointer', padding: 0 }}>← Back</button>
          <div className="listing-title" style={{ flex: 1 }}>Edit Listing</div>
        </div>

        {error && <div className="auth-error" style={{ marginBottom: 20 }}>{error}</div>}

        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '24px 32px' }}>

          <label className="login-field-label">Listing Title</label>
          <input
            className="login-field-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Vintage Holo Collection"
          />

          <label className="login-field-label">Description</label>
          <textarea
            className="login-field-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your cards, any flaws, or what you are looking for..."
            style={{ height: 100, resize: 'vertical' }}
          />

          <label className="login-field-label">Photos</label>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              {existingPhotos.map((photo) => (
                <div key={photo.id} style={{ position: 'relative', width: 80, height: 80, borderRadius: 6, overflow: 'hidden', border: '1px solid #e5e5e5' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="Existing" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    onClick={(e) => { e.preventDefault(); removeExistingPhoto(photo.id); }}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >✕</button>
                </div>
              ))}
              {newPhotoPreviews.map((src, i) => (
                <div key={`new-${i}`} style={{ position: 'relative', width: 80, height: 80, borderRadius: 6, overflow: 'hidden', border: '1px dashed #4fa94d' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    onClick={(e) => { e.preventDefault(); removeNewPhoto(i); }}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >✕</button>
                </div>
              ))}
              <label style={{ width: 80, height: 80, borderRadius: 6, border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#fafafa', color: '#888', fontSize: 24 }}>
                +
                <input type="file" multiple accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="login-field-label">Minimum Price ($)</label>
              <input
                className="login-field-input"
                type="number"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="login-field-label">Maximum Price ($)</label>
              <input
                className="login-field-input"
                type="number"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <label className="login-field-label">Trade Preferences</label>
          <input
            className="login-field-input"
            value={tradePreferences}
            onChange={(e) => setTradePreferences(e.target.value)}
            placeholder="e.g. Base set Charizard, anything sealed..."
          />

          <hr style={{ border: 'none', borderTop: '1px solid #e5e5e5', margin: '24px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="login-heading" style={{ fontSize: 16, margin: 0 }}>Cards</div>
            <button
              onClick={addCard}
              style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              + Add Card
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {cards.map((card, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px', border: '1px solid #e5e5e5', borderRadius: 4, background: '#fafafa' }}>
                <input
                  className="login-field-input"
                  style={{ flex: 2, marginBottom: 0, padding: '6px 10px' }}
                  placeholder="Card Name"
                  value={card.card_name}
                  onChange={(e) => updateCard(i, 'card_name', e.target.value)}
                />
                <input
                  className="login-field-input"
                  style={{ flex: 1, marginBottom: 0, padding: '6px 10px' }}
                  placeholder="Set"
                  value={card.set_name}
                  onChange={(e) => updateCard(i, 'set_name', e.target.value)}
                />
                <select
                  className="login-field-input"
                  style={{ width: 100, marginBottom: 0, padding: '6px 10px' }}
                  value={card.condition}
                  onChange={(e) => updateCard(i, 'condition', e.target.value)}
                >
                  {['Mint', 'NM', 'LP', 'MP', 'HP', 'Damaged'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  className="login-field-input"
                  style={{ width: 90, marginBottom: 0, padding: '6px 10px' }}
                  placeholder="Price $"
                  value={card.custom_price}
                  onChange={(e) => updateCard(i, 'custom_price', e.target.value)}
                />
                <button
                  onClick={() => removeCard(i)}
                  style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', padding: 8 }}
                >✕</button>
              </div>
            ))}
            {cards.length === 0 && <div style={{ fontSize: 13, color: '#aaa', fontStyle: 'italic' }}>No cards added yet. Click &quot;+ Add Card&quot; to list specific cards.</div>}
          </div>

          <button className="login-submit-btn" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving Changes...' : 'Save Changes'}
          </button>
        </div>
      </div>
      <Footer />
    </>
  );
}
