-- =========================================================================
-- Manch Reels — demo seed: curated hashtag sets + trending audio for the
-- current week, across the 8 Reels languages. Run AFTER migrations 0001–0005.
-- In production these are populated by the weekly cron + curation (§8.3);
-- this seed makes the features work immediately for demo/dev.
-- week = this ISO week's Monday (matches lib/utils isoWeekMonday()).
-- =========================================================================

-- Instagram hashtag sets (10 high / 10 mid / 10 niche where authored; a mix of
-- native-script + the common English tags real Indian creators actually use).
insert into public.hashtag_sets (language_code, platform, week, tags, source, curated) values
('hi', 'instagram', date_trunc('week', now())::date, '{
  "high": ["#reels","#viral","#trending","#india","#रील्स","#वायरल","#explore","#instagram","#instagood","#reelsindia"],
  "mid":  ["#व्लॉग","#कॉमेडी","#मोटिवेशन","#desi","#bollywood","#foodie","#dailyvlog","#reelitfeelit","#funny","#trendingreels"],
  "niche":["#स्ट्रीटफूड","#देसीस्वैग","#हिंदीशायरी","#smallcreator","#indianstreetfood","#villagelife","#nostalgia","#desivibes","#relatable","#storytime"]
}'::jsonb, 'seed', true),
('ta', 'instagram', date_trunc('week', now())::date, '{
  "high": ["#tamil","#reels","#viral","#தமிழ்","#ரீல்ஸ்","#trending","#chennai","#kollywood","#tamilreels","#instatamil"],
  "mid":  ["#காமெடி","#vlog","#tamilcomedy","#foodie","#tamilsong","#trendingreels","#tamilan","#funny","#tamilstatus","#reelitfeelit"],
  "niche":["#சினிமா","#தெருஉணவு","#tamilkavithai","#smallcreator","#chennaifood","#villagefood","#nostalgia","#tamilvibes","#relatable","#storytime"]
}'::jsonb, 'seed', true),
('te', 'instagram', date_trunc('week', now())::date, '{
  "high": ["#telugu","#reels","#viral","#తెలుగు","#trending","#hyderabad","#tollywood","#telugureels","#instatelugu","#telugucomedy"],
  "mid":  ["#వ్లాగ్","#comedy","#foodie","#telugusong","#trendingreels","#funny","#telugustatus","#reelitfeelit","#dailyvlog","#telanganafood"],
  "niche":["#సినిమా","#వీధిఆహారం","#telugukavithalu","#smallcreator","#hyderabadfood","#villagelife","#nostalgia","#teluguvibes","#relatable","#storytime"]
}'::jsonb, 'seed', true),
('mr', 'instagram', date_trunc('week', now())::date, '{
  "high": ["#marathi","#reels","#viral","#मराठी","#trending","#mumbai","#pune","#marathireels","#instamarathi","#marathicomedy"],
  "mid":  ["#व्लॉग","#comedy","#foodie","#marathisong","#trendingreels","#funny","#marathistatus","#reelitfeelit","#maharashtra","#dailyvlog"],
  "niche":["#मराठमोळं","#रस्तेखाद्य","#marathikavita","#smallcreator","#punefood","#konkan","#nostalgia","#marathivibes","#relatable","#storytime"]
}'::jsonb, 'seed', true),
('bn', 'instagram', date_trunc('week', now())::date, '{
  "high": ["#bengali","#reels","#viral","#বাংলা","#trending","#kolkata","#tollywood","#bengalireels","#instabangla","#banglacomedy"],
  "mid":  ["#ভ্লগ","#comedy","#foodie","#banglasong","#trendingreels","#funny","#banglastatus","#reelitfeelit","#westbengal","#dailyvlog"],
  "niche":["#সিনেমা","#রাস্তারখাবার","#banglakobita","#smallcreator","#kolkatafood","#villagelife","#nostalgia","#banglavibes","#relatable","#storytime"]
}'::jsonb, 'seed', true),
('kn', 'instagram', date_trunc('week', now())::date, '{
  "high": ["#kannada","#reels","#viral","#ಕನ್ನಡ","#trending","#bangalore","#sandalwood","#kannadareels","#instakannada","#kannadacomedy"],
  "mid":  ["#ವ್ಲಾಗ್","#comedy","#foodie","#kannadasong","#trendingreels","#funny","#kannadastatus","#reelitfeelit","#karnataka","#dailyvlog"],
  "niche":["#ಸಿನಿಮಾ","#ಬೀದಿಆಹಾರ","#kannadakavana","#smallcreator","#bangalorefood","#malnad","#nostalgia","#kannadavibes","#relatable","#storytime"]
}'::jsonb, 'seed', true),
('gu', 'instagram', date_trunc('week', now())::date, '{
  "high": ["#gujarati","#reels","#viral","#ગુજરાતી","#trending","#ahmedabad","#dhollywood","#gujaratireels","#instagujarati","#gujjucomedy"],
  "mid":  ["#વ્લોગ","#comedy","#foodie","#gujaratisong","#trendingreels","#funny","#gujjustatus","#reelitfeelit","#gujarat","#dailyvlog"],
  "niche":["#ગુજ્જુ","#સ્ટ્રીટફૂડ","#gujaratikavita","#smallcreator","#ahmedabadfood","#kutch","#nostalgia","#gujjuvibes","#relatable","#storytime"]
}'::jsonb, 'seed', true),
('pa', 'instagram', date_trunc('week', now())::date, '{
  "high": ["#punjabi","#reels","#viral","#ਪੰਜਾਬੀ","#trending","#punjab","#pollywood","#punjabireels","#instapunjabi","#punjabicomedy"],
  "mid":  ["#ਵਲੌਗ","#comedy","#foodie","#punjabisong","#trendingreels","#funny","#punjabistatus","#reelitfeelit","#chandigarh","#dailyvlog"],
  "niche":["#ਪੇਂਡੂ","#ਸਟਰੀਟਫੂਡ","#punjabishayari","#smallcreator","#amritsarfood","#pind","#nostalgia","#punjabivibes","#relatable","#storytime"]
}'::jsonb, 'seed', true)
on conflict (language_code, platform, week) do nothing;

-- Trending audio (a few per language; we link to the source, never host).
insert into public.trending_audio (language_code, region, platform, title, audio_url, mood, week, rank, curated) values
('hi', null, 'instagram', 'Trending Bollywood hook — romantic', 'https://www.instagram.com/reels/audio/hi-romantic-1', 'romantic', date_trunc('week', now())::date, 1, true),
('hi', null, 'instagram', 'Desi hype beat', 'https://www.instagram.com/reels/audio/hi-hype-2', 'hype', date_trunc('week', now())::date, 2, true),
('hi', null, 'instagram', 'Emotional shayari background', 'https://www.instagram.com/reels/audio/hi-emotional-3', 'emotional', date_trunc('week', now())::date, 3, true),
('ta', null, 'instagram', 'Kollywood mass beat', 'https://www.instagram.com/reels/audio/ta-mass-1', 'hype', date_trunc('week', now())::date, 1, true),
('ta', null, 'instagram', 'Tamil melody hook', 'https://www.instagram.com/reels/audio/ta-melody-2', 'romantic', date_trunc('week', now())::date, 2, true),
('te', null, 'instagram', 'Tollywood trending', 'https://www.instagram.com/reels/audio/te-trend-1', 'hype', date_trunc('week', now())::date, 1, true),
('mr', null, 'instagram', 'Marathi dhol beat', 'https://www.instagram.com/reels/audio/mr-dhol-1', 'devotional', date_trunc('week', now())::date, 1, true),
('bn', null, 'instagram', 'Bangla adda vibe', 'https://www.instagram.com/reels/audio/bn-adda-1', 'happy', date_trunc('week', now())::date, 1, true),
('gu', null, 'instagram', 'Garba trending loop', 'https://www.instagram.com/reels/audio/gu-garba-1', 'happy', date_trunc('week', now())::date, 1, true),
('pa', null, 'instagram', 'Punjabi bhangra drop', 'https://www.instagram.com/reels/audio/pa-bhangra-1', 'hype', date_trunc('week', now())::date, 1, true)
on conflict do nothing;
