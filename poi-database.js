// POI Database for proximity alerts
// Each POI: { name, lat, lng, desc, city, category }
// Categories: temple, palace, market, food, nature, culture, shopping, nightlife, viewpoint, hidden-gem

const STATIC_POIS = [
  // ===== SEOUL =====
  // Palaces & Historic
  { name: "Gyeongbokgung Palace", lat: 37.5796, lng: 126.9770, desc: "Korea's grandest palace (1395). Guard changing ceremony at 10am & 2pm. Free entry in hanbok.", city: "Seoul", category: "palace" },
  { name: "Changdeokgung Palace & Secret Garden", lat: 37.5794, lng: 126.9910, desc: "UNESCO palace with a stunning hidden garden. Secret Garden tours require booking — one of Seoul's best experiences.", city: "Seoul", category: "palace" },
  { name: "Deoksugung Palace", lat: 37.5658, lng: 126.9751, desc: "Beautiful stone-wall walking path outside. Guard ceremony at 11am, 2pm, 3:30pm. Great at night when illuminated.", city: "Seoul", category: "palace" },
  { name: "Changgyeonggung Palace", lat: 37.5789, lng: 126.9946, desc: "Less crowded palace with beautiful greenhouse and cherry trees. Opens for night visits seasonally.", city: "Seoul", category: "palace" },

  // Temples
  { name: "Jogyesa Temple", lat: 37.5730, lng: 126.9836, desc: "Chief Buddhist temple in Seoul. Stunning lotus lantern displays in April-May for Buddha's Birthday.", city: "Seoul", category: "temple" },
  { name: "Bongeunsa Temple", lat: 37.5154, lng: 127.0581, desc: "1,200-year-old temple hidden between Gangnam skyscrapers. Offers temple stay programs and free tea.", city: "Seoul", category: "temple" },
  { name: "Gilsangsa Temple", lat: 37.5932, lng: 126.9917, desc: "Peaceful hilltop temple in Seongbuk-dong, built on the site of a famous gisaeng house. Very serene.", city: "Seoul", category: "temple" },

  // Markets & Food Streets
  { name: "Gwangjang Market", lat: 37.5701, lng: 126.9995, desc: "Seoul's oldest market (1905). Famous for bindaetteok, mayak gimbap, yukhoe (beef tartare). Must visit.", city: "Seoul", category: "market" },
  { name: "Namdaemun Market", lat: 37.5592, lng: 126.9773, desc: "Massive traditional market near Seoul Station. Great for street food, ginseng, souvenirs, and clothing.", city: "Seoul", category: "market" },
  { name: "Tongin Market", lat: 37.5773, lng: 126.9688, desc: "Charming lunch box market near Gyeongbokgung. Buy coins, fill your tray at different stalls. Unique experience.", city: "Seoul", category: "market" },
  { name: "Mangwon Market", lat: 37.5561, lng: 126.9105, desc: "Local neighborhood market near Hongdae. Less touristy, excellent tteokbokki and seasonal produce.", city: "Seoul", category: "market" },
  { name: "Noryangjin Fish Market", lat: 37.5133, lng: 126.9408, desc: "Huge wholesale fish market. Buy seafood downstairs, have it prepared upstairs. Vibrant and chaotic.", city: "Seoul", category: "market" },

  // Culture & Museums
  { name: "National Museum of Korea", lat: 37.5209, lng: 126.9804, desc: "World-class museum, completely free. 300,000+ artifacts spanning Korean history. Allow 2-3 hours minimum.", city: "Seoul", category: "culture" },
  { name: "War Memorial of Korea", lat: 37.5344, lng: 126.9771, desc: "Powerful museum about Korean War history. Free entry. Outdoor displays of tanks, planes, ships.", city: "Seoul", category: "culture" },
  { name: "Leeum Samsung Museum of Art", lat: 37.5388, lng: 126.9978, desc: "World-class art museum in Itaewon. Traditional Korean art + contemporary. Building designed by 3 star architects.", city: "Seoul", category: "culture" },
  { name: "Dongdaemun Design Plaza (DDP)", lat: 37.5671, lng: 127.0095, desc: "Zaha Hadid's futuristic landmark. Free to explore. LED rose garden stunning at night.", city: "Seoul", category: "culture" },
  { name: "MMCA Seoul (Modern Art Museum)", lat: 37.5800, lng: 126.9792, desc: "National Museum of Modern and Contemporary Art, right next to Gyeongbokgung. Free or cheap entry.", city: "Seoul", category: "culture" },

  // Neighborhoods & Streets
  { name: "Bukchon Hanok Village", lat: 37.5826, lng: 126.9831, desc: "Traditional hanok neighborhood between palaces. Beautiful alleyways with curved tile rooftops. Keep quiet — residents live here.", city: "Seoul", category: "culture" },
  { name: "Ikseon-dong Hanok Alley", lat: 37.5726, lng: 126.9922, desc: "Trendy hanok alley with hip cafes, vintage shops, and restaurants in renovated traditional houses. Less touristy than Bukchon.", city: "Seoul", category: "hidden-gem" },
  { name: "Ihwa Mural Village", lat: 37.5805, lng: 127.0063, desc: "Colorful hillside murals and art installations. Open-air gallery in a residential neighborhood. Be respectful of residents.", city: "Seoul", category: "culture" },
  { name: "Seochon Village", lat: 37.5790, lng: 126.9680, desc: "Charming neighborhood west of Gyeongbokgung. Independent cafes, galleries, and boutiques. Authentic local vibe.", city: "Seoul", category: "hidden-gem" },
  { name: "Yeonnam-dong", lat: 37.5622, lng: 126.9230, desc: "Trendy neighborhood next to Hongdae with the beautiful Gyeongui Line Forest Park. Great cafes and restaurants.", city: "Seoul", category: "hidden-gem" },
  { name: "Itaewon & Haebangchon", lat: 37.5345, lng: 126.9945, desc: "International neighborhood with diverse food scene. Haebangchon (HBC) on the hill has cozy bars and restaurants.", city: "Seoul", category: "nightlife" },

  // Parks & Nature
  { name: "Naksan Park", lat: 37.5800, lng: 127.0080, desc: "Hilltop park on Seoul's fortress wall. Panoramic city views. Best at sunset.", city: "Seoul", category: "viewpoint" },
  { name: "Haneul Park (Sky Park)", lat: 37.5678, lng: 126.8855, desc: "Former landfill turned into a beautiful hilltop park. Silver grass fields are stunning in autumn. Great views.", city: "Seoul", category: "nature" },
  { name: "Seoul Forest", lat: 37.5444, lng: 127.0374, desc: "Large urban park like NYC's Central Park. Deer garden, butterfly garden, cycling paths. Great for a relaxed morning.", city: "Seoul", category: "nature" },
  { name: "Cheonggyecheon Stream", lat: 37.5700, lng: 126.9783, desc: "10.9km restored urban stream. Walking paths, art installations, waterfalls. Beautiful illumination at night.", city: "Seoul", category: "nature" },
  { name: "Namsan Tower (N Seoul Tower)", lat: 37.5512, lng: 126.9882, desc: "360° panoramic views from 480m above sea level. Take the cable car. Best at sunset. Love locks on the fence.", city: "Seoul", category: "viewpoint" },

  // Shopping & Entertainment
  { name: "Myeongdong", lat: 37.5636, lng: 126.9869, desc: "Premier shopping district. Korean cosmetics, fashion, street food. Best in the evening when food vendors are out.", city: "Seoul", category: "shopping" },
  { name: "Insadong", lat: 37.5745, lng: 126.9856, desc: "Traditional arts and crafts street. Galleries, tea houses, Ssamjigil spiral market. Great for souvenirs.", city: "Seoul", category: "shopping" },
  { name: "Hongdae", lat: 37.5563, lng: 126.9237, desc: "Young creative neighborhood. Indie music, street performances, quirky shops, nightlife. Busking near the playground.", city: "Seoul", category: "nightlife" },
  { name: "Gangnam Station Area", lat: 37.4979, lng: 127.0276, desc: "The famous Gangnam. Underground shopping, K-beauty stores, trendy cafes. Feel the Gangnam Style.", city: "Seoul", category: "shopping" },
  { name: "Starfield COEX Mall", lat: 37.5116, lng: 127.0595, desc: "Massive underground mall with the famous Starfield Library — two-story bookshelves. Great rainy day activity.", city: "Seoul", category: "shopping" },
  { name: "Dongdaemun Night Market", lat: 37.5671, lng: 127.0095, desc: "Shopping malls open until 5 AM. K-fashion bargains, street food, buzzing nightlife atmosphere.", city: "Seoul", category: "nightlife" },

  // Food
  { name: "Tosokchon Samgyetang", lat: 37.5780, lng: 126.9716, desc: "Famous ginseng chicken soup near Gyeongbokgung. Whole chicken stuffed with ginseng and rice. Seafood-free. Long lines worth it.", city: "Seoul", category: "food" },
  { name: "Myeongdong Kyoja", lat: 37.5635, lng: 126.9853, desc: "Legendary noodle soup since 1966. Michelin Bib Gourmand. Simple menu — just pick noodles or dumplings.", city: "Seoul", category: "food" },
  { name: "Maple Tree House (Itaewon)", lat: 37.5340, lng: 126.9945, desc: "Upscale Korean BBQ. High-quality aged galbi. Reserve for dinner.", city: "Seoul", category: "food" },
  { name: "Yukjeon Hoekwan", lat: 37.5563, lng: 126.9220, desc: "Michelin-listed bulgogi since 1959. Simmering pot of marinated beef. Iconic Seoul dining.", city: "Seoul", category: "food" },
  { name: "Jungsik", lat: 37.5230, lng: 127.0230, desc: "Michelin-starred modern Korean fine dining. Book via Catch Table app well in advance.", city: "Seoul", category: "food" },

  // ===== JEJU =====
  { name: "Seongsan Ilchulbong (Sunrise Peak)", lat: 33.4612, lng: 126.9403, desc: "Dramatic volcanic crater rising from the sea. UNESCO site. 30 min climb to crater rim. 5,000 won entry.", city: "Jeju", category: "nature" },
  { name: "Manjanggul Lava Tube", lat: 33.5282, lng: 126.7714, desc: "One of the world's longest lava tubes. Walk 1km inside the cave. Cool temperature year-round. Great rainy day activity.", city: "Jeju", category: "nature" },
  { name: "Hallasan National Park", lat: 33.3617, lng: 126.5292, desc: "Korea's highest mountain (1,950m). Multiple hiking trails from easy to challenging. The Eorimok trail is scenic and moderate.", city: "Jeju", category: "nature" },
  { name: "O'sulloc Tea Museum", lat: 33.3060, lng: 126.2890, desc: "Free museum surrounded by green tea fields. Tastings, matcha desserts, Innisfree shop. Beautiful setting.", city: "Jeju", category: "culture" },
  { name: "Daepo Jusangjeolli Cliff", lat: 33.2380, lng: 126.4250, desc: "Hexagonal basalt columns along the coast. Photogenic geological formation. Quick visit, 2,000 won.", city: "Jeju", category: "nature" },
  { name: "Hyeopjae Beach", lat: 33.3940, lng: 126.2400, desc: "White coral sand, emerald water, views of Biyangdo Island. One of Jeju's most beautiful beaches.", city: "Jeju", category: "nature" },
  { name: "Udo Island", lat: 33.5020, lng: 126.9520, desc: "Picturesque island off Jeju's east coast. E-bike the 15km loop. Peanut ice cream is a must.", city: "Jeju", category: "nature" },
  { name: "Saryeoni Forest Trail", lat: 33.3830, lng: 126.6690, desc: "Serene cedar forest walk. Flat, easy, peaceful. May be closed Nov-May — check before going.", city: "Jeju", category: "nature" },
  { name: "Jeju Dongmun Market", lat: 33.5120, lng: 126.5280, desc: "Jeju's largest traditional market. Fresh tangerines, Jeju black pork, hallabong juice, local snacks.", city: "Jeju", category: "market" },
  { name: "Seopjikoji", lat: 33.4240, lng: 126.9310, desc: "Dramatic coastal cliff walk near Seongsan. Lighthouse, canola fields, ocean views. Less crowded than Ilchulbong.", city: "Jeju", category: "nature" },
  { name: "Dombedon", lat: 33.5120, lng: 126.5310, desc: "Michelin-rated Jeju black pork BBQ. Grilled at your table. Arrive early for dinner — fills up fast.", city: "Jeju", category: "food" },
  { name: "Jeju Folk Village Museum", lat: 33.3222, lng: 126.8425, desc: "Open-air museum with 117 traditional Jeju houses. Understand the island's unique culture and architecture.", city: "Jeju", category: "culture" },
  { name: "Cheonjiyeon Waterfall", lat: 33.2476, lng: 126.5545, desc: "Beautiful 22m waterfall in Seogwipo. Short walk from entrance. Lit up at night for evening visits.", city: "Jeju", category: "nature" },

  // ===== BUSAN =====
  { name: "Gamcheon Culture Village", lat: 35.0975, lng: 129.0107, desc: "Colorful hillside houses with murals and art. 'Machu Picchu of Busan'. Follow the stamp-trail map.", city: "Busan", category: "culture" },
  { name: "Haeundae Beach", lat: 35.1587, lng: 129.1604, desc: "Busan's most famous beach. Great boardwalk, restaurants, and nightlife even outside swim season.", city: "Busan", category: "nature" },
  { name: "Haedong Yonggungsa Temple", lat: 35.1884, lng: 129.2233, desc: "Rare seaside temple built in 1376. Waves crash below the prayer halls. Arrive early to beat crowds.", city: "Busan", category: "temple" },
  { name: "Jagalchi Fish Market", lat: 35.0968, lng: 129.0306, desc: "Korea's largest seafood market. Fresh catches prepared on the spot. 2nd floor for sit-down meals.", city: "Busan", category: "market" },
  { name: "BIFF Square", lat: 35.0983, lng: 129.0290, desc: "Film festival plaza with star handprints. Surrounded by legendary hotteok (sweet pancake) vendors.", city: "Busan", category: "culture" },
  { name: "Gukje Market", lat: 35.1007, lng: 129.0288, desc: "Traditional market since 1950. Covered alleys with clothing, housewares, and great street food.", city: "Busan", category: "market" },
  { name: "Gwangalli Beach", lat: 35.1531, lng: 129.1185, desc: "Urban beach with a stunning view of the illuminated Gwangan Bridge at night. Great cafe and bar scene.", city: "Busan", category: "nature" },
  { name: "Taejongdae", lat: 35.0517, lng: 129.0847, desc: "Dramatic coastal cliffs on the southern tip of Busan. Lighthouse, observation deck, Danubi train ride.", city: "Busan", category: "nature" },
  { name: "Spa Land Centum City", lat: 35.1694, lng: 129.1316, desc: "Premium jjimjilbang inside Shinsegae department store. 22 themed spa zones. Perfect rainy day or evening activity.", city: "Busan", category: "hidden-gem" },
  { name: "Shinsegae Centum City", lat: 35.1690, lng: 129.1310, desc: "World's largest department store (Guinness Record). Ice rink, spa, cinema, luxury shopping.", city: "Busan", category: "shopping" },
  { name: "Beomeosa Temple", lat: 35.2839, lng: 129.0681, desc: "One of Korea's great Buddhist temples, tucked in the mountains above Busan. Peaceful, less touristy. Free entry.", city: "Busan", category: "temple" },
  { name: "Samgwangsa Temple", lat: 35.1724, lng: 129.0539, desc: "40,000 lotus lanterns lit for Buddha's Birthday season (April-May). Spectacular free sight.", city: "Busan", category: "temple" },
  { name: "Oryukdo Skywalk", lat: 35.0985, lng: 129.1237, desc: "Glass-bottom walkway over the ocean cliffs. Free entry. End point of the Igidae Coastal Walk.", city: "Busan", category: "viewpoint" },
  { name: "Haeundae Blueline Park", lat: 35.1630, lng: 129.1870, desc: "Sky Capsule pods and Beach Train along the coast. Book Sky Capsule ahead — sells out. Beach Train is walk-in.", city: "Busan", category: "culture" },

  // ===== GYEONGJU =====
  { name: "Bulguksa Temple", lat: 35.7900, lng: 129.3320, desc: "UNESCO Silla-era masterpiece (528 AD). Stone pagodas, forest setting. One of Korea's top 3 cultural sites.", city: "Gyeongju", category: "temple" },
  { name: "Seokguram Grotto", lat: 35.7958, lng: 129.3493, desc: "8th-century cave with magnificent seated Buddha. UNESCO site. Uphill forest walk from Bulguksa. 5,000 won.", city: "Gyeongju", category: "temple" },
  { name: "Wolji Pond (Anapji)", lat: 35.8344, lng: 129.2268, desc: "Silla palace garden from 674 AD. Pavilions reflected in still water. Visit at night — magical. 3,000 won.", city: "Gyeongju", category: "culture" },
  { name: "Hwangridan-gil", lat: 35.8340, lng: 129.2180, desc: "Gyeongju's trendy cafe and restaurant street in renovated hanok buildings. Great for dinner.", city: "Gyeongju", category: "food" },
  { name: "Daereungwon Tomb Complex", lat: 35.8352, lng: 129.2124, desc: "Ancient Silla royal burial mounds. Cheonmachong tomb is open to walk inside. Atmospheric and unique.", city: "Gyeongju", category: "culture" },
  { name: "Cheomseongdae Observatory", lat: 35.8347, lng: 129.2190, desc: "7th-century astronomical observatory — oldest surviving one in East Asia. Small but historically significant.", city: "Gyeongju", category: "culture" },
  { name: "Gyeongju National Museum", lat: 35.8315, lng: 129.2268, desc: "Excellent museum covering Silla dynasty history. Gold crowns, Buddhist art, weapons. Free entry.", city: "Gyeongju", category: "culture" },
];

// Runtime POIs — loaded from database on startup, kept in sync
let customPois = [];

// Load custom POIs from database into memory
async function loadCustomPois() {
  try {
    const { getCustomPois } = require('./db');
    customPois = await getCustomPois();
    console.log(`📍 Loaded ${customPois.length} custom POIs from database`);
  } catch (err) {
    console.error('Failed to load custom POIs from DB:', err.message);
  }
}

function getAllPois() {
  return [...STATIC_POIS, ...customPois];
}

function addCustomPoi(name, lat, lng, desc, createdBy) {
  // Add to memory immediately
  customPois.push({ name, lat, lng, desc, city: 'Custom', category: 'hidden-gem', created_by: createdBy || null });
  // Persist to database
  try {
    const { addCustomPoiDB } = require('./db');
    addCustomPoiDB(name, lat, lng, desc, createdBy).catch(err => console.error('DB addPoi error:', err.message));
  } catch (err) { /* db not ready yet */ }
}

function clearCustomPois(createdBy) {
  if (createdBy) {
    // Remove only this user's POIs from memory
    const lowerName = createdBy.toLowerCase();
    for (let i = customPois.length - 1; i >= 0; i--) {
      if (customPois[i].created_by && customPois[i].created_by.toLowerCase() === lowerName) {
        customPois.splice(i, 1);
      }
    }
  } else {
    // Remove all custom POIs
    customPois.length = 0;
  }
  try {
    const { clearCustomPoisDB } = require('./db');
    clearCustomPoisDB(createdBy).catch(err => console.error('DB clearPois error:', err.message));
  } catch (err) { /* db not ready yet */ }
}

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearbyPois(lat, lng, radiusMeters = 300) {
  return getAllPois()
    .map(poi => ({ ...poi, distance: Math.round(getDistance(lat, lng, poi.lat, poi.lng)) }))
    .filter(poi => poi.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance);
}

module.exports = { getAllPois, addCustomPoi, clearCustomPois, findNearbyPois, getDistance, customPois, loadCustomPois };
