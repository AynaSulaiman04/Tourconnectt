/**
 * Seeds a coherent Trinidad and Tobago demo dataset for the three demo
 * accounts created by `scripts/seed-demo-accounts.mjs`.
 *
 * Run `npm run seed:demo` first, then:
 *
 *   npm run seed:demo-data
 *
 * The script is idempotent: listings, inquiries, conversations, reviews and
 * knowledge sources are matched on a stable marker so re-running updates the
 * same rows instead of duplicating them. It never touches rows it did not
 * create, except for the demotion pass described in `DEMOTE_NON_DEMO_LISTINGS`.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DEMO_MARKER = "tt-connect-demo-dataset";

const TRAVELER_EMAIL = process.env.DEMO_TRAVELER_EMAIL ?? "traveler.demo@tourconnectt.test";
const OPERATOR_EMAIL = process.env.DEMO_OPERATOR_EMAIL ?? "operator.demo@tourconnectt.test";
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL ?? "admin.demo@tourconnectt.test";

/**
 * Legacy seed rows point the public storefront at generic stock destinations
 * with no price, which reads badly in a client walkthrough. Set this to "0" to
 * leave every pre-existing listing exactly as it is.
 */
const DEMOTE_NON_DEMO_LISTINGS = process.env.DEMO_DEMOTE_LEGACY_LISTINGS !== "0";

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL (or DIRECT_URL).");
}

const OPERATOR_NAME = "Tour ConnecTT Demo Operator";

const LISTINGS = [
  {
    slug: "pigeon-point-catamaran",
    title: "Pigeon Point Catamaran & Nylon Pool",
    location: "Pigeon Point, Tobago",
    country: "Trinidad and Tobago",
    duration: "1 Day",
    price: "TTD 950",
    summary:
      "A full day on the water from Pigeon Point: Buccoo Reef by glass-bottom boat, a long swim stop at the Nylon Pool, and lunch served on deck. Small groups, local skipper, hotel pickup included.",
    imageUrl: "/landing/slideshow/20251222_133750.jpg",
    status: "live",
    featured: true,
  },
  {
    slug: "asa-wright-rainforest",
    title: "Asa Wright Rainforest & Waterfall Walk",
    location: "Arima Valley, Trinidad",
    country: "Trinidad and Tobago",
    duration: "1 Day",
    price: "TTD 780",
    summary:
      "Guided birding through the Northern Range with a naturalist, followed by a gentle hike to a freshwater cascade. Ideal for first-time visitors and photographers. Breakfast and permits included.",
    imageUrl: "/landing/slideshow/20260120_094637.jpg",
    status: "live",
    featured: true,
  },
  {
    slug: "leatherback-turtle-watch",
    title: "Leatherback Turtle Watch at Grande Riviere",
    location: "Grande Riviere, Trinidad",
    country: "Trinidad and Tobago",
    duration: "2 Days",
    price: "TTD 1,650",
    summary:
      "A seasonal overnight on Trinidad's north coast to witness leatherback nesting with a licensed guide. Includes one night's accommodation, conservation permit, dinner and transfers from Port of Spain.",
    imageUrl: "/landing/slideshow/20250710_160750.jpg",
    status: "live",
    featured: true,
  },
  {
    slug: "tobago-coast-sunset",
    title: "Tobago West Coast Sunset Sail",
    location: "Store Bay, Tobago",
    country: "Trinidad and Tobago",
    duration: "Half Day",
    price: "TTD 620",
    summary:
      "An evening sail along Tobago's leeward coast with rum punch, steel pan and a swim stop before sunset. Private charter available for couples and small celebrations.",
    imageUrl: "/landing/slideshow/20250618_181026.jpg",
    status: "live",
    featured: false,
  },
  {
    slug: "heritage-village-tour",
    title: "Heritage Villages & Cocoa Estate Tour",
    location: "Lopinot, Trinidad",
    country: "Trinidad and Tobago",
    duration: "1 Day",
    price: "TTD 690",
    summary:
      "Trace the island's cocoa and parang heritage through Lopinot valley: estate house, drying houses, a tasting led by the estate family, and a parang session with local musicians.",
    imageUrl: "/landing/slideshow/20260120_142255.jpg",
    status: "under_review",
    featured: false,
  },
  {
    slug: "north-coast-drive",
    title: "North Coast Drive & Maracas Bay",
    location: "Maracas, Trinidad",
    country: "Trinidad and Tobago",
    duration: "Half Day",
    price: "TTD 480",
    summary:
      "The classic North Coast Road run with viewpoint stops, a bake and shark lunch at Maracas, and time to swim at Las Cuevas. Draft itinerary pending final pricing review.",
    imageUrl: "/landing/slideshow/dji_0406.jpg",
    status: "draft",
    featured: false,
  },
];

const INQUIRIES = [
  {
    slug: "inq-confirmed-paid",
    listingSlug: "pigeon-point-catamaran",
    status: "confirmed",
    paymentAmount: "950.00",
    startOffsetDays: 21,
    endOffsetDays: 21,
    availability: "morning",
    notes:
      "Two adults, celebrating an anniversary. Hotel pickup from Crown Point. One guest is a nervous swimmer, so a stop with shallow footing would help.",
    payment: { status: "paid", amount: "950.00" },
  },
  {
    slug: "inq-confirmed-awaiting-payment",
    listingSlug: "leatherback-turtle-watch",
    status: "confirmed",
    paymentAmount: "1650.00",
    startOffsetDays: 34,
    endOffsetDays: 35,
    availability: "evening",
    notes:
      "Family of four, two children aged 9 and 12. Confirmed with the operator; traveller still to complete WiPay checkout.",
    payment: null,
  },
  {
    slug: "inq-reviewed",
    listingSlug: "asa-wright-rainforest",
    status: "reviewed",
    paymentAmount: "780.00",
    startOffsetDays: 12,
    endOffsetDays: 12,
    availability: "morning",
    notes:
      "Keen birder travelling solo. Asked whether a longer morning start is possible and whether a scope can be provided.",
    payment: null,
  },
  {
    slug: "inq-submitted",
    listingSlug: "tobago-coast-sunset",
    status: "submitted",
    paymentAmount: null,
    startOffsetDays: 45,
    endOffsetDays: 45,
    availability: "afternoon",
    notes: "Group of six for a birthday. Asking about a private charter and whether cake can be brought aboard.",
    payment: null,
  },
  {
    slug: "inq-closed",
    listingSlug: "asa-wright-rainforest",
    status: "closed",
    paymentAmount: "780.00",
    startOffsetDays: -26,
    endOffsetDays: -26,
    availability: "morning",
    notes: "Completed trip from last month. Traveller left a review afterwards.",
    payment: { status: "paid", amount: "780.00" },
  },
];

const KNOWLEDGE_SOURCES = [
  {
    title: "Getting around Trinidad and Tobago",
    sourceType: "guide",
    content:
      "Trinidad and Tobago are two islands. Piarco (POS) serves Trinidad and A.N.R. Robinson (TAB) serves Tobago. The inter-island ferry from Port of Spain to Scarborough takes about two and a half hours; the domestic flight takes twenty minutes and books out quickly around Carnival and Easter. Route taxis and maxi taxis cover most corridors on Trinidad; a hired driver is the practical option for the North Coast Road and the north-east.",
  },
  {
    title: "When to visit",
    sourceType: "guide",
    content:
      "Dry season runs January to May and is the most reliable window for beach and sailing days. Carnival falls in February or March and fills accommodation months ahead. Leatherback turtle nesting runs March to August, with peak activity in May and June at Grande Riviere and Matura. The wet season, June to December, brings short heavy afternoon showers rather than all-day rain, and the rainforest is at its best.",
  },
  {
    title: "Booking and payment on Tour ConnecTT",
    sourceType: "policy",
    content:
      "Travellers send an enquiry to a local operator rather than booking instantly. The operator reviews dates and details, then confirms. Once a booking is confirmed and an amount is set, the traveller completes payment through WiPay hosted checkout in Trinidad and Tobago dollars. Payment is only available on confirmed bookings. Platform commission is twenty per cent of the gross amount and the operator payout is eighty per cent.",
  },
  {
    title: "Food and local etiquette",
    sourceType: "guide",
    content:
      "Doubles are the standard breakfast; bake and shark is the Maracas Bay staple. Pepper is served on the side and 'slight pepper' is a normal request. Roti, pelau, callaloo and curry crab with dumpling in Tobago are worth planning around. Tipping is not obligatory but ten per cent is welcomed. Beachwear stays at the beach; cover up in villages, shops and places of worship.",
  },
  {
    title: "Accessibility and support",
    sourceType: "policy",
    content:
      "Accessibility varies by experience: catamaran and sunset sail departures involve a short wet boarding, and the rainforest and waterfall walks include uneven ground and steps. Travellers should note mobility, dietary or medical requirements in the enquiry so the operator can adjust the itinerary or suggest an alternative. Support requests should include the email address used for the account.",
  },
];

/**
 * Listing covers point at files in public/. Those get renamed and replaced as
 * the photo set changes, and a stale path shows up as a broken image on the
 * storefront rather than as any kind of error — so fail loudly here instead.
 */
const missingImages = LISTINGS.filter(
  (listing) =>
    listing.imageUrl.startsWith("/") && !fs.existsSync(path.join("public", listing.imageUrl.slice(1))),
);

if (missingImages.length) {
  throw new Error(
    `These listing cover images are not in public/:\n${missingImages
      .map((listing) => `  ${listing.imageUrl}  (${listing.title})`)
      .join("\n")}\nUpdate LISTINGS[].imageUrl to files that exist.`,
  );
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

async function profileIdFor(email) {
  const { rows } = await client.query(`select id from profiles where lower(email) = lower($1) limit 1`, [email]);

  if (!rows.length) {
    throw new Error(`No profile for ${email}. Run "npm run seed:demo" first.`);
  }

  return rows[0].id;
}

const travelerId = await profileIdFor(TRAVELER_EMAIL);
const operatorId = await profileIdFor(OPERATOR_EMAIL);
const adminId = await profileIdFor(ADMIN_EMAIL);

console.log(`traveler ${TRAVELER_EMAIL}\noperator ${OPERATOR_EMAIL}\nadmin    ${ADMIN_EMAIL}\n`);

/* ---------------------------------------------------------------- listings */

const listingIdBySlug = new Map();

for (const listing of LISTINGS) {
  const marker = `${DEMO_MARKER}:${listing.slug}`;
  const { rows } = await client.query(
    `select id from tour_listings where summary like $1 or title = $2 limit 1`,
    [`%${marker}%`, listing.title],
  );

  const summary = listing.summary;
  const values = [
    listing.title,
    listing.location,
    listing.country,
    listing.duration,
    summary,
    listing.imageUrl,
    OPERATOR_NAME,
    listing.featured,
    operatorId,
    listing.price,
    listing.status,
  ];

  if (rows.length) {
    await client.query(
      `update tour_listings set title=$1, location=$2, country=$3, duration=$4, summary=$5, image_url=$6,
         operator_name=$7, featured=$8, operator_id=$9, price=$10, status=$11, is_active=true,
         image_base64=null, updated_at=timezone('utc', now())
       where id=$12`,
      [...values, rows[0].id],
    );
    listingIdBySlug.set(listing.slug, rows[0].id);
    console.log(`listing updated  ${listing.status.padEnd(13)} ${listing.title}`);
  } else {
    const inserted = await client.query(
      `insert into tour_listings
         (title,location,country,duration,summary,image_url,operator_name,featured,operator_id,price,status,is_active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true) returning id`,
      values,
    );
    listingIdBySlug.set(listing.slug, inserted.rows[0].id);
    console.log(`listing created  ${listing.status.padEnd(13)} ${listing.title}`);
  }
}

if (DEMOTE_NON_DEMO_LISTINGS) {
  const demoIds = [...listingIdBySlug.values()];
  const { rows } = await client.query(
    `update tour_listings set status='draft', featured=false, updated_at=timezone('utc', now())
     where status in ('live','under_review') and not (id = any($1::uuid[]))
     returning title`,
    [demoIds],
  );

  for (const row of rows) {
    console.log(`legacy listing demoted to draft: ${row.title}`);
  }
}

/* --------------------------------------------------------------- inquiries */

const inquiryIdBySlug = new Map();

for (const inquiry of INQUIRIES) {
  const listingId = listingIdBySlug.get(inquiry.listingSlug);
  const listing = LISTINGS.find((entry) => entry.slug === inquiry.listingSlug);
  const fingerprint = `${DEMO_MARKER}:${inquiry.slug}`;

  const { rows } = await client.query(`select id from inquiries where submission_fingerprint = $1 limit 1`, [
    fingerprint,
  ]);

  const values = [
    travelerId,
    listingId,
    "Demo Traveller",
    TRAVELER_EMAIL,
    "+1-868-555-0142",
    listing.location,
    listing.country,
    OPERATOR_NAME,
    inquiry.startOffsetDays,
    inquiry.endOffsetDays,
    inquiry.availability,
    inquiry.notes,
    inquiry.status,
    operatorId,
    inquiry.paymentAmount,
    fingerprint,
  ];

  if (rows.length) {
    await client.query(
      `update inquiries set user_id=$1, listing_id=$2, traveler_name=$3, traveler_email=$4, traveler_phone=$5,
         destination=$6, destination_country=$7, operator_name=$8,
         preferred_start_date = current_date + ($9)::int, preferred_end_date = current_date + ($10)::int,
         availability=$11, notes=$12, status=$13, operator_id=$14, payment_amount=$15,
         updated_at=timezone('utc', now())
       where submission_fingerprint=$16`,
      values,
    );
    inquiryIdBySlug.set(inquiry.slug, rows[0].id);
    console.log(`inquiry updated  ${inquiry.status.padEnd(13)} ${listing.title}`);
  } else {
    const inserted = await client.query(
      `insert into inquiries
         (user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,
          operator_name,preferred_start_date,preferred_end_date,availability,notes,status,operator_id,
          payment_amount,submission_fingerprint)
       values ($1,$2,$3,$4,$5,$6,$7,$8,current_date + ($9)::int,current_date + ($10)::int,$11,$12,$13,$14,$15,$16)
       returning id`,
      values,
    );
    inquiryIdBySlug.set(inquiry.slug, inserted.rows[0].id);
    console.log(`inquiry created  ${inquiry.status.padEnd(13)} ${listing.title}`);
  }
}

/* ---------------------------------------------------------------- payments */

for (const inquiry of INQUIRIES) {
  if (!inquiry.payment) {
    continue;
  }

  const inquiryId = inquiryIdBySlug.get(inquiry.slug);
  const orderId = `wpdemo${inquiry.slug.replace(/[^a-z0-9]/g, "").slice(0, 22)}`;
  const gross = Number.parseFloat(inquiry.payment.amount);
  const commission = Math.round(gross * 0.2 * 100) / 100;
  const settlement = JSON.stringify({
    created_from: "demo_dataset",
    settlement: {
      grossAmount: gross,
      adminCommissionAmount: commission,
      operatorPayoutAmount: Math.round((gross - commission) * 100) / 100,
      adminCommissionRate: 0.2,
      operatorPayoutRate: 0.8,
    },
  });

  await client.query(
    `insert into wipay_payments
       (inquiry_id,provider,order_id,transaction_id,status,amount,currency,country_code,response_payload,paid_at)
     values ($1,'wipay',$2,$3,$4,$5,'TTD','TT',$6::jsonb, timezone('utc', now()) - interval '2 days')
     on conflict (order_id) do update set
       inquiry_id=excluded.inquiry_id, status=excluded.status, amount=excluded.amount,
       response_payload=excluded.response_payload, paid_at=excluded.paid_at,
       updated_at=timezone('utc', now())`,
    [inquiryId, orderId, `SB-DEMO-${orderId}`, inquiry.payment.status, inquiry.payment.amount, settlement],
  );

  console.log(`payment  ${inquiry.payment.status.padEnd(9)} TTD ${inquiry.payment.amount}  ${orderId}`);
}

/* ----------------------------------------------------------- conversations */

const THREAD = [
  { role: "traveler", message: "Hi! We have booked the Pigeon Point catamaran for our anniversary. Is hotel pickup from Crown Point included?" },
  { role: "operator", message: "Welcome! Yes, pickup from any Crown Point hotel is included. We collect at 08:15 and you are back by 15:30." },
  { role: "traveler", message: "Perfect. One of us is a nervous swimmer — is there a stop where we can stand?" },
  { role: "operator", message: "The Nylon Pool is waist to chest deep with a sand bottom, so it suits nervous swimmers well. We also carry floats and a crew member stays in the water throughout." },
  { role: "traveler", message: "That is reassuring, thank you. Payment is done — see you on the 21st." },
];

const confirmedInquiryId = inquiryIdBySlug.get("inq-confirmed-paid");
const conversationListingId = listingIdBySlug.get("pigeon-point-catamaran");

const existingConversation = await client.query(
  `select id from traveler_operator_conversations where traveler_id=$1 and operator_id=$2 and inquiry_id=$3 limit 1`,
  [travelerId, operatorId, confirmedInquiryId],
);

let conversationId;

if (existingConversation.rows.length) {
  conversationId = existingConversation.rows[0].id;
  await client.query(`delete from traveler_operator_messages where conversation_id=$1`, [conversationId]);
} else {
  const inserted = await client.query(
    `insert into traveler_operator_conversations (traveler_id,operator_id,listing_id,inquiry_id,status)
     values ($1,$2,$3,$4,'open') returning id`,
    [travelerId, operatorId, conversationListingId, confirmedInquiryId],
  );
  conversationId = inserted.rows[0].id;
}

for (const [index, entry] of THREAD.entries()) {
  const minutesAgo = (THREAD.length - index) * 37;
  await client.query(
    `insert into traveler_operator_messages (conversation_id,sender_id,sender_role,message,read_at,created_at)
     values ($1,$2,$3,$4,$5, timezone('utc', now()) - ($6 || ' minutes')::interval)`,
    [
      conversationId,
      entry.role === "traveler" ? travelerId : operatorId,
      entry.role,
      entry.message,
      index < THREAD.length - 1 ? new Date().toISOString() : null,
      String(minutesAgo),
    ],
  );
}

await client.query(
  `update traveler_operator_conversations set last_message_at = timezone('utc', now()), updated_at = timezone('utc', now()) where id=$1`,
  [conversationId],
);

console.log(`conversation seeded with ${THREAD.length} messages`);

/* ----------------------------------------------------------------- reviews */

const closedInquiryId = inquiryIdBySlug.get("inq-closed");

await client.query(`delete from reviews where traveler_id=$1 and inquiry_id=$2`, [travelerId, closedInquiryId]);
await client.query(
  `insert into reviews (traveler_id,operator_id,listing_id,inquiry_id,rating,comment)
   values ($1,$2,$3,$4,5,$5)`,
  [
    travelerId,
    operatorId,
    listingIdBySlug.get("asa-wright-rainforest"),
    closedInquiryId,
    "Our guide knew every call in the valley and got us onto a bellbird within the first hour. The waterfall walk was gentle enough for my mother and the breakfast was excellent. Booked a second day on the spot.",
  ],
);

console.log("review seeded");

/* ------------------------------------------------------- operator settings */

await client.query(
  `insert into operator_settings (id) values ($1)
   on conflict (id) do update set updated_at = timezone('utc', now())`,
  [operatorId],
);

/* ---------------------------------------------------- concierge knowledge */

for (const source of KNOWLEDGE_SOURCES) {
  const { rows } = await client.query(`select id from concierge_knowledge_sources where title=$1 limit 1`, [
    source.title,
  ]);

  if (rows.length) {
    await client.query(
      `update concierge_knowledge_sources set source_type=$1, content=$2, is_active=true,
         metadata=jsonb_build_object('seeded_by', $3::text), updated_at=timezone('utc', now()) where id=$4`,
      [source.sourceType, source.content, DEMO_MARKER, rows[0].id],
    );
  } else {
    await client.query(
      `insert into concierge_knowledge_sources (source_type,title,content,is_active,metadata)
       values ($1,$2,$3,true,jsonb_build_object('seeded_by', $4::text))`,
      [source.sourceType, source.title, source.content, DEMO_MARKER],
    );
  }
}

console.log(`${KNOWLEDGE_SOURCES.length} concierge knowledge sources seeded`);

/* ----------------------------------------------------------- notifications */

const NOTIFICATIONS = [
  {
    recipient: operatorId,
    actor: travelerId,
    kind: "inquiry_received",
    title: "New enquiry: Tobago West Coast Sunset Sail",
    body: "Demo Traveller asked about a private charter for a group of six.",
    href: "/OperatorBookings",
  },
  {
    recipient: operatorId,
    actor: travelerId,
    kind: "payment_received",
    title: "Payment received: TTD 950.00",
    body: "Pigeon Point Catamaran & Nylon Pool is paid in full. Payout share is TTD 760.00.",
    href: "/OperatorDashboard?paymentStatus=paid",
  },
  {
    recipient: adminId,
    actor: operatorId,
    kind: "listing_submitted",
    title: "Listing awaiting review",
    body: "Heritage Villages & Cocoa Estate Tour was submitted for moderation.",
    href: "/AdminListings",
  },
  {
    recipient: travelerId,
    actor: operatorId,
    kind: "booking_confirmed",
    title: "Your booking is confirmed",
    body: "Leatherback Turtle Watch at Grande Riviere is confirmed. Complete payment to secure your place.",
    href: "/TravellerProfile",
  },
];

await client.query(`delete from platform_notifications where metadata->>'seeded_by' = $1`, [DEMO_MARKER]);

for (const [index, notification] of NOTIFICATIONS.entries()) {
  await client.query(
    `insert into platform_notifications (recipient_profile_id,actor_profile_id,kind,title,body,href,metadata,created_at)
     values ($1,$2,$3,$4,$5,$6, jsonb_build_object('seeded_by', $7::text), timezone('utc', now()) - ($8 || ' hours')::interval)`,
    [
      notification.recipient,
      notification.actor,
      notification.kind,
      notification.title,
      notification.body,
      notification.href,
      DEMO_MARKER,
      String(index * 6 + 1),
    ],
  );
}

console.log(`${NOTIFICATIONS.length} notifications seeded`);

await client.end();
console.log("\nDemo dataset ready.");
