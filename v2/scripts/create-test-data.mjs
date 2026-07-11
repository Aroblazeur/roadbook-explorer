import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wuberwxheznzntdyqwyj.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const email = 'audit-test-18a+' + Date.now() + '@example.com';
const password = 'TestPassword123!';

const { data: userData, error: userError } = await supabase.auth.admin.createUser({
  email, password, email_confirm: true,
  user_metadata: { display_name: 'Audit Test 18A' }
});
if (userError) { console.error('Create user error:', userError.message); process.exit(1); }
const userId = userData.user.id;
console.log('USER_ID:', userId);
console.log('EMAIL:', email);
console.log('PASSWORD:', password);

// Create profile manually (trigger may not fire for admin API)
const { error: profileError } = await supabase.from('profiles').upsert({
  id: userId,
  display_name: 'Audit Test 18A',
  avatar_url: null
}).eq('id', userId);
if (profileError) { console.error('Profile error:', profileError.message); process.exit(1); }
console.log('PROFILE created');

const rb1 = await supabase.from('roadbooks').insert({
  owner_id: userId,
  title: 'AUDIT 18A — Test complet',
  slug: 'audit-18a-test-' + Date.now(),
  description: "Roadbook de test pour l'audit Sprint 18A",
  is_public: false,
  metadata: {
    activity: 'randonnee', destination: 'Alpes', project: 'Audit 18A',
    official: { distance: 100, elevationGain: 5000, elevationLoss: 4800 },
    stagesTotal: { distance: 0, elevationGain: 0, elevationLoss: 0 }
  }
}).select().single();
if (rb1.error) { console.error('Create RB1 error:', rb1.error.message); process.exit(1); }
console.log('RB1_ID:', rb1.data.id, 'SLUG:', rb1.data.slug);

const stageData = [
  { stage_number: 1, title: 'Depart Alpes', departure: 'Chamonix', arrival: 'Refuge du Mont Blanc', distance_km: 12.5, elevation_gain_m: 850, elevation_loss_m: 200, duration: '6h', accommodation_name: 'Refuge du Mont Blanc', notes: [{text:'Prevoir vetements chauds'},{text:'Dernier point eau a 2500m'}] },
  { stage_number: 2, title: 'Traversee du massif', departure: 'Refuge du Mont Blanc', arrival: 'Col de la Traversette', distance_km: 18.2, elevation_gain_m: 1200, elevation_loss_m: 900, duration: '8h30', accommodation_name: 'Gite de la Traversette' },
  { stage_number: 3, title: 'Descente vers la vallee', departure: 'Col de la Traversette', arrival: 'Saint-Véran', distance_km: 15.0, elevation_gain_m: 400, elevation_loss_m: 1100, duration: '5h45' }
];

for (const s of stageData) {
  const { data: stage, error: stageErr } = await supabase.from('stages').insert({
    roadbook_id: rb1.data.id, ...s,
    metadata: { difficulty: 'modere', description: s.stage_number === 1 ? 'Magnifique depart en montagne' : '' }
  }).select().single();
  if (stageErr) { console.error('Stage error:', stageErr.message); continue; }
  console.log('STAGE_ID:', stage.id, s.title);

  if (s.stage_number === 1) {
    await supabase.from('stage_pois').insert([
      { stage_id: stage.id, name: 'Lac Blanc', poi_type: 'lac', description: 'Magnifique lac altitude', lat: 45.123, lng: 6.789, sort_order: 0 },
      { stage_id: stage.id, name: 'Belvedere des Aiguilles', poi_type: 'viewpoint', lat: 45.456, lng: 6.912, sort_order: 1 }
    ]);
    await supabase.from('stage_variants').insert({
      stage_id: stage.id, label: 'Variante par le Lac Noir', description: 'Passage par le Lac Noir, plus technique',
      distance_km: 14.8, elevation_gain_m: 1050, elevation_loss_m: 300, sort_order: 0
    });
  }
}

const rb2 = await supabase.from('roadbooks').insert({
  owner_id: userId,
  title: 'AUDIT 18A — Brouillon prive',
  slug: 'audit-18a-draft-' + Date.now(),
  description: '', is_public: false,
  metadata: { activity: '', destination: '', project: '' }
}).select().single();
if (rb2.error) { console.error('Create RB2 error:', rb2.error.message); process.exit(1); }
console.log('RB2_ID:', rb2.data.id, 'SLUG:', rb2.data.slug);

console.log('\nTEST_CREDENTIALS:');
console.log('Email:', email);
console.log('Password:', password);
