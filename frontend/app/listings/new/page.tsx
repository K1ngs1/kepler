'use client';

import { useState, useRef } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface CatalogCard {
  id: string;
  name: string;
  set_name: string;
  number: string;
}

export default function NewListingPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [pricingMode, setPricingMode] = useState<'market' | 'custom'>('market');
  const [tradePreferences, setTradePreferences] = useState('');
  
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<CatalogCard[]>([]);
  
  const [selectedCards, setSelectedCards] = useState<{
    catalog_card: CatalogCard;
    condition: string;
    custom_price: string;
  }[]>([]);

  const [listingPhotos, setListingPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSearch = async (query: string) => {
    setSearch(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    const { data } = await supabase
      .from('catalog_cards')
      .select('id, name, set_name, number')
      .ilike('name', `%${query}%`)
      .limit(10);
    if (data) setSearchResults(data);
  };

  const addCard = (card: CatalogCard) => {
    setSelectedCards([...selectedCards, { catalog_card: card, condition: 'NM', custom_price: '' }]);
    setSearch('');
    setSearchResults([]);
  };

  const updateCard = (index: number, field: string, value: string) => {
    const updated = [...selectedCards];
    (updated[index] as any)[field] = value;
    setSelectedCards(updated);
  };

  const removeCard = (index: number) => {
    setSelectedCards(selectedCards.filter((_, i) => i !== index));
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const newPreviews = files.map(f => URL.createObjectURL(f));
    setListingPhotos(prev => [...prev, ...files]);
    setPhotoPreviews(prev => [...prev, ...newPreviews]);
  };

  const removePhoto = (index: number) => {
    setListingPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title) { setError('Title is required'); return; }
    if (selectedCards.length === 0) { setError('Add at least one card to the listing'); return; }

    setLoading(true);
    setError('');
    const supabase = createClient();
    if (!supabase) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('You must be logged in to create a listing.');
      setLoading(false);
      return;
    }

    try {
      const pMin = priceMin ? parseFloat(priceMin) : null;
      const pMax = priceMax ? parseFloat(priceMax) : null;

      const { data: listing, error: listingError } = await supabase
        .from('listings')
        .insert({
          seller_id: user.id,
          title,
          description,
          price_min: pMin,
          price_max: pMax,
          pricing_mode: pricingMode,
          trade_preferences: tradePreferences
        })
        .select('id')
        .single();

      if (listingError) throw listingError;

      let coverPhotoUrl = null;
      for (let i = 0; i < listingPhotos.length; i++) {
        const file = listingPhotos[i];
        const path = `listings/${listing.id}/${Date.now()}-${i}`;
        // Try uploading to 'card-photos' bucket as it's known to exist
        const { error: uploadError } = await supabase.storage
          .from('card-photos')
          .upload(path, file, { contentType: file.type });
          
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('card-photos').getPublicUrl(path);
          const url = urlData.publicUrl;
          if (i === 0) coverPhotoUrl = url;
          
          await supabase.from('listing_photos').insert({
            listing_id: listing.id,
            url,
            sort_order: i
          });
        } else {
          console.error("Failed to upload photo:", uploadError);
        }
      }
      
      if (coverPhotoUrl) {
        await supabase.from('listings').update({ cover_photo_url: coverPhotoUrl }).eq('id', listing.id);
      }

      // Now insert listing_items
      for (const card of selectedCards) {
        const cPrice = card.custom_price ? parseFloat(card.custom_price) : null;
        
        // MVP: we're not hooking it strictly to `user_cards` here in this UI directly unless they select from collection.
        // The requirements say "card selector (search catalog_cards, add with condition and optional custom price)"
        // If we just add it to `listing_items` and don't link `user_card_id`, the seller won't have it tracked in collection, 
        // but `listing_items` schema allows `user_card_id` to be null.
        
        const { error: itemError } = await supabase
          .from('listing_items')
          .insert({
            listing_id: listing.id,
            catalog_card_id: card.catalog_card.id,
            condition: card.condition,
            custom_price: pricingMode === 'custom' ? cPrice : null
          });
          
        if (itemError) throw itemError;
      }

      router.push(`/listings/${listing.id}`);
    } catch (err: any) {
      setError(err.message || 'Error creating listing');
      setLoading(false);
    }
  };

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px' }}>
        <div className="listing-toolbar" style={{ marginBottom: 24 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 13, color: '#777', cursor: 'pointer', padding: 0 }}>← Back</button>
          <div className="listing-title" style={{ flex: 1 }}>Create a New Listing</div>
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
              {photoPreviews.map((src, i) => (
                <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 6, overflow: 'hidden', border: '1px solid #e5e5e5' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button 
                    onClick={(e) => { e.preventDefault(); removePhoto(i); }}
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

          <label className="login-field-label">Pricing Mode</label>
          <select 
            className="login-field-input" 
            value={pricingMode} 
            onChange={(e) => setPricingMode(e.target.value as 'market'|'custom')}
          >
            <option value="market">Use Market Prices</option>
            <option value="custom">Use Custom Prices per Card</option>
          </select>

          <label className="login-field-label">Trade Preferences</label>
          <input
            className="login-field-input"
            value={tradePreferences}
            onChange={(e) => setTradePreferences(e.target.value)}
            placeholder="e.g. Base set Charizard, anything sealed..."
          />

          <hr style={{ border: 'none', borderTop: '1px solid #e5e5e5', margin: '24px 0' }} />

          <div className="login-heading" style={{ fontSize: 16, marginBottom: 12 }}>Add Cards</div>
          
          <div className="toolbar-search" style={{ marginBottom: 16 }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" /></svg>
            <input 
              placeholder="Search catalog cards..." 
              value={search} 
              onChange={(e) => handleSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 14px 10px 32px' }}
            />
          </div>

          {searchResults.length > 0 && (
            <div style={{ border: '1px solid #ccc', borderRadius: 4, maxHeight: 150, overflowY: 'auto', marginBottom: 16 }}>
              {searchResults.map(card => (
                <div 
                  key={card.id} 
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}
                  onClick={() => addCard(card)}
                >
                  <span style={{ fontWeight: 600 }}>{card.name}</span>
                  <span style={{ color: '#777', marginLeft: 8 }}>{card.set_name} · #{card.number}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {selectedCards.map((card, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px', border: '1px solid #e5e5e5', borderRadius: 4, background: '#fafafa' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{card.catalog_card.name}</div>
                  <div style={{ fontSize: 11, color: '#777' }}>{card.catalog_card.set_name}</div>
                </div>
                
                <select 
                  className="login-field-input" 
                  style={{ width: 120, marginBottom: 0, padding: '6px 10px' }}
                  value={card.condition}
                  onChange={(e) => updateCard(i, 'condition', e.target.value)}
                >
                  {['Mint', 'NM', 'LP', 'MP', 'HP', 'Damaged'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {pricingMode === 'custom' && (
                  <input
                    className="login-field-input"
                    style={{ width: 100, marginBottom: 0, padding: '6px 10px' }}
                    placeholder="Price $"
                    value={card.custom_price}
                    onChange={(e) => updateCard(i, 'custom_price', e.target.value)}
                  />
                )}

                <button 
                  onClick={() => removeCard(i)}
                  style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', padding: 8 }}
                >✕</button>
              </div>
            ))}
            {selectedCards.length === 0 && <div style={{ fontSize: 13, color: '#aaa', fontStyle: 'italic' }}>No cards added yet.</div>}
          </div>

          <button className="login-submit-btn" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : 'Create Listing'}
          </button>
        </div>
      </div>
      <Footer />
    </>
  );
}
