import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { sampleServices, samplePrograms, sampleCourses } from '../src/lib/catalog/sample-data'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting MVP seed...')

  // Hash passwords
  const adminHashedPassword = await bcrypt.hash('admin123', 10)
  const userHashedPassword = await bcrypt.hash('password123', 10)
  const healerHashedPassword = await bcrypt.hash('healer123', 10)

  // Create users
  await prisma.user.upsert({
    where: { email: 'admin@ganges-healers.com' },
    update: {},
    create: {
      email: 'admin@ganges-healers.com',
      name: 'Admin User',
      password: adminHashedPassword,
      role: 'ADMIN',
      vip: true,
      freeSessionCredits: 5,
    },
  })

  await prisma.user.upsert({
    where: { email: 'john@example.com' },
    update: {},
    create: {
      email: 'john@example.com',
      name: 'John Doe',
      password: userHashedPassword,
      role: 'USER',
      vip: false,
      freeSessionCredits: 2,
    },
  })

  console.log('Users created')

  // Create 5 healers
  const healers = []
  
  const healerData = [
    {
      email: 'priya@ganges-healers.com',
      name: 'Priya Sharma',
      bio: 'Experienced yoga therapist and Reiki master with 12+ years of practice. Specializes in stress relief and spiritual healing.',
      experienceYears: 12,
      rating: 4.9,
      certifications: [
        { name: 'Certified Yoga Therapist', year: 2012 },
        { name: 'Reiki Master Level III', year: 2015 }
      ],
      availability: {
        monday: { start: '09:00', end: '17:00' },
        tuesday: { start: '09:00', end: '17:00' },
        wednesday: { start: '10:00', end: '18:00' },
        thursday: { start: '09:00', end: '17:00' },
        friday: { start: '09:00', end: '16:00' }
      }
    },
    {
      email: 'raj@ganges-healers.com',
      name: 'Raj Patel',
      bio: 'Professional hypnotherapist and past life regression specialist. Helps clients overcome limiting beliefs and heal emotional trauma.',
      experienceYears: 8,
      rating: 4.7,
      certifications: [
        { name: 'Certified Clinical Hypnotherapist', year: 2016 },
        { name: 'Past Life Regression Therapy', year: 2019 }
      ],
      availability: {
        monday: { start: '10:00', end: '18:00' },
        wednesday: { start: '10:00', end: '18:00' },
        friday: { start: '10:00', end: '18:00' },
        saturday: { start: '09:00', end: '15:00' }
      }
    },
    {
      email: 'maya@ganges-healers.com',
      name: 'Maya Singh',
      bio: 'Intuitive tarot reader and spiritual guide with deep knowledge of various divination systems. Provides clarity and insight for life decisions.',
      experienceYears: 10,
      rating: 4.8,
      certifications: [
        { name: 'Professional Tarot Certification', year: 2014 },
        { name: 'Astrology Diploma', year: 2017 }
      ],
      availability: {
        tuesday: { start: '11:00', end: '19:00' },
        thursday: { start: '11:00', end: '19:00' },
        saturday: { start: '10:00', end: '18:00' },
        sunday: { start: '12:00', end: '17:00' }
      }
    },
    {
      email: 'arjun@ganges-healers.com',
      name: 'Arjun Khanna',
      bio: 'Movement therapy specialist and somatic healer. Uses body-based approaches to release trauma and restore natural movement patterns.',
      experienceYears: 6,
      rating: 4.6,
      certifications: [
        { name: 'Somatic Movement Educator', year: 2018 },
        { name: 'Trauma-Informed Movement Therapy', year: 2020 }
      ],
      availability: {
        monday: { start: '08:00', end: '16:00' },
        tuesday: { start: '08:00', end: '16:00' },
        thursday: { start: '08:00', end: '16:00' },
        friday: { start: '08:00', end: '14:00' }
      }
    },
    {
      email: 'kavya@ganges-healers.com',
      name: 'Kavya Reddy',
      bio: 'Art therapist and creative healing facilitator. Combines traditional art techniques with therapeutic practices for emotional expression and healing.',
      experienceYears: 7,
      rating: 4.8,
      certifications: [
        { name: 'Registered Art Therapist', year: 2017 },
        { name: 'Expressive Arts Therapy', year: 2019 }
      ],
      availability: {
        tuesday: { start: '10:00', end: '18:00' },
        wednesday: { start: '10:00', end: '18:00' },
        friday: { start: '10:00', end: '18:00' },
        saturday: { start: '09:00', end: '15:00' }
      }
    }
  ]

  const healerSpecializationsMap: string[][] = [
    ["Yoga", "Reiki"],            // Priya
    ["Hypnotherapy", "Prana Healing"], // Raj
    ["Tarot", "Reiki"],          // Maya
    ["Movement Therapy"],         // Arjun
    ["Art Therapy"],              // Kavya
  ]

  for (const [index, data] of healerData.entries()) {
    const user = await prisma.user.upsert({
      where: { email: data.email },
      update: {},
      create: {
        email: data.email,
        name: data.name,
        password: healerHashedPassword,
        role: 'HEALER',
        vip: true,
        freeSessionCredits: 0,
      },
    })

    const healer = await prisma.healer.upsert({
      where: { userId: user.id },
      update: {
        bio: data.bio,
        experienceYears: data.experienceYears,
        rating: data.rating,
        certifications: data.certifications,
        availability: data.availability,
        specializations: healerSpecializationsMap[index],
        isVerified: true,
      },
      create: {
        userId: user.id,
        bio: data.bio,
        experienceYears: data.experienceYears,
        rating: data.rating,
        isVerified: true,
        certifications: data.certifications,
        availability: data.availability,
        specializations: healerSpecializationsMap[index],
      },
    })

    healers.push(healer)
  }

  console.log('Healers created')

  // Create 7 MVP services
  const services = []
  
  const serviceData = sampleServices.slice(0, 7)

  type ServiceModeType = 'ONLINE' | 'OFFLINE' | 'BOTH'

  for (const data of serviceData) {
    const createInput = {
      name: data.name,
      slug: data.slug,
      description: data.description,
      tagline: data.tagline,
      category: data.category,
      price: data.price,
      duration: data.duration,
  mode: data.mode as ServiceModeType,
      benefits: data.benefits
    }
    const service = await prisma.service.upsert({
      where: { slug: data.slug },
      update: {},
      create: createInput,
    })
    services.push(service)
  }

  console.log('Services created')

  // Junction removed: healer specializations now drive service association
  console.log('Healer specializations assigned (junction removed)')
  // --- Analytics demo data (payments, refunds, memberships) ---
  console.log('Seeding analytics demo data (payments/memberships)...')

  // Ensure at least one membership plan monthly + yearly
  const monthlyPlan = await prisma.membershipPlan.upsert({
    where: { slug: 'vip-monthly' },
    update: {},
    create: { slug: 'vip-monthly', title: 'VIP Monthly', pricePaise: 19900, interval: 'MONTHLY', razorpayPlanId: 'plan_monthly_demo', benefits: { freeSessions: 2 } }
  })
  const yearlyPlan = await prisma.membershipPlan.upsert({
    where: { slug: 'vip-yearly' },
    update: {},
    create: { slug: 'vip-yearly', title: 'VIP Yearly', pricePaise: 199000, interval: 'YEARLY', razorpayPlanId: 'plan_yearly_demo', benefits: { freeSessions: 24 } }
  })

  // Create active memberships for admin + john
  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@ganges-healers.com' } })
  const johnUser = await prisma.user.findUnique({ where: { email: 'john@example.com' } })
  if (adminUser) {
    await prisma.vIPMembership.upsert({
      where: { subscriptionId: 'sub_demo_admin_monthly' },
      update: { status: 'active' },
      create: { subscriptionId: 'sub_demo_admin_monthly', userId: adminUser.id, planId: monthlyPlan.id, status: 'active', startDate: new Date() }
    })
  }
  if (johnUser) {
    await prisma.vIPMembership.upsert({
      where: { subscriptionId: 'sub_demo_john_yearly' },
      update: { status: 'active' },
      create: { subscriptionId: 'sub_demo_john_yearly', userId: johnUser.id, planId: yearlyPlan.id, status: 'active', startDate: new Date() }
    })
  }

  // Helper to create payment records across days
  const paymentUser = adminUser || johnUser
  if (paymentUser) {
    const today = new Date()
    const dayMs = 24*60*60*1000
    const sample: Array<{ offset: number; amount: number; type: any; meta?: any }> = [ // eslint-disable-line @typescript-eslint/no-explicit-any
      { offset: 1, amount: 50000, type: 'SESSION', meta: { bookingId: 'demo_b1' } },
      { offset: 2, amount: 150000, type: 'PROGRAM', meta: { programId: 'demo_prog1' } },
      { offset: 5, amount: 19900, type: 'MEMBERSHIP' },
      { offset: 10, amount: 75000, type: 'SESSION', meta: { bookingId: 'demo_b2' } },
      { offset: 15, amount: 90000, type: 'PROGRAM', meta: { programId: 'demo_prog2' } },
      { offset: 40, amount: 60000, type: 'SESSION', meta: { bookingId: 'old_out_of_range' } } // outside 30d window
    ]
    for (const row of sample) {
      const createdAt = new Date(today.getTime() - row.offset * dayMs)
      await prisma.payment.create({
        data: {
          gateway: 'seed',
            status: 'success',
          statusEnum: 'SUCCESS',
          amountPaise: row.amount,
          userId: paymentUser.id,
          type: row.type,
          metadata: row.meta || {},
          createdAt
        }
      })
    }
    // Create a refund against one of the program payments
    const refundBase = await prisma.payment.findFirst({ where: { type: 'PROGRAM', statusEnum: 'SUCCESS' } })
    if (refundBase) {
      await prisma.refund.create({ data: { paymentId: refundBase.id, amountPaise: Math.round(refundBase.amountPaise/2), reason: 'demo partial', status: 'processed' } })
    }
  }

  console.log('Analytics demo data seeded')

  // --- 3 additional services to reach 10 total ---
  const extraServices = sampleServices.slice(7)

  for (const data of extraServices) {
    await prisma.service.upsert({
      where: { slug: data.slug },
      update: {},
      create: data,
    })
  }
  console.log('10 services created')

  // --- 6 Programs ---
  const programsData = samplePrograms

  for (const p of programsData) {
    await prisma.program.upsert({ where: { slug: p.slug }, update: {}, create: p })
  }
  console.log('6 programs created')

  // --- 8 Courses with lessons ---
  const coursesData = sampleCourses

  for (const c of coursesData) {
    const course = await prisma.course.upsert({
      where: { slug: c.slug },
      update: {},
      create: { slug: c.slug, title: c.title, description: c.description, pricePaise: c.pricePaise },
    })
    for (let i = 0; i < c.lessons.length; i++) {
      const existing = await prisma.courseLesson.findFirst({ where: { courseId: course.id, order: i + 1 } })
      if (!existing) {
        await prisma.courseLesson.create({ data: { courseId: course.id, title: c.lessons[i], order: i + 1, content: `Lesson content for: ${c.lessons[i]}` } })
      }
    }
  }
  console.log('8 courses with lessons created')

  // --- 15 Products (store) ---
  const categories = [
    { slug: 'crystals', title: 'Crystals & Stones' },
    { slug: 'meditation-tools', title: 'Meditation Tools' },
    { slug: 'yoga-accessories', title: 'Yoga Accessories' },
    { slug: 'aromatherapy', title: 'Aromatherapy' },
  ]

  const categoryRecords: Record<string, string> = {}
  for (const cat of categories) {
    const record = await prisma.productCategory.upsert({ where: { slug: cat.slug }, update: {}, create: cat })
    categoryRecords[cat.slug] = record.id
  }

  const productsData = [
    { slug: 'amethyst-cluster', title: 'Amethyst Cluster', shortDescription: 'Natural amethyst cluster for spiritual awareness', longDescription: 'Beautiful natural amethyst cluster perfect for meditation spaces, energy cleansing, and promoting spiritual awareness. Each piece is unique.', pricePaise: 249900, categorySlug: 'crystals' },
    { slug: 'rose-quartz-heart', title: 'Rose Quartz Heart', shortDescription: 'Polished rose quartz for love and healing', longDescription: 'Hand-polished rose quartz heart stone promoting unconditional love, self-care, and emotional healing. Ideal for heart chakra work.', pricePaise: 149900, categorySlug: 'crystals' },
    { slug: 'clear-quartz-point', title: 'Clear Quartz Point', shortDescription: 'Master healer crystal point', longDescription: 'Premium clear quartz point, known as the master healer. Amplifies energy and intention. Perfect for crystal grids and meditation.', pricePaise: 189900, categorySlug: 'crystals' },
    { slug: 'selenite-wand', title: 'Selenite Wand', shortDescription: 'Cleansing selenite wand', longDescription: 'Natural selenite wand for aura cleansing, energy clearing, and charging other crystals. A must-have for any energy worker.', pricePaise: 129900, categorySlug: 'crystals' },
    { slug: 'singing-bowl-set', title: 'Tibetan Singing Bowl Set', shortDescription: 'Handcrafted singing bowl with mallet', longDescription: 'Handcrafted Tibetan singing bowl with cushion and wooden mallet. Produces rich, resonant tones for meditation, relaxation, and sound healing.', pricePaise: 399900, categorySlug: 'meditation-tools' },
    { slug: 'meditation-cushion', title: 'Meditation Cushion (Zafu)', shortDescription: 'Organic buckwheat zafu cushion', longDescription: 'Premium organic cotton zafu meditation cushion filled with buckwheat hulls. Provides perfect posture support for extended meditation sessions.', pricePaise: 299900, categorySlug: 'meditation-tools' },
    { slug: 'mala-beads-108', title: '108 Mala Beads', shortDescription: 'Rudraksha mala for mantra meditation', longDescription: 'Authentic 108-bead Rudraksha mala necklace hand-knotted with silk thread. Traditional tool for mantra meditation and spiritual practice.', pricePaise: 199900, categorySlug: 'meditation-tools' },
    { slug: 'incense-set', title: 'Premium Incense Collection', shortDescription: 'Set of 6 healing incense varieties', longDescription: 'Curated collection of 6 premium incense varieties: sandalwood, frankincense, sage, lavender, palo santo, and nag champa. Hand-rolled, natural ingredients.', pricePaise: 89900, categorySlug: 'aromatherapy' },
    { slug: 'essential-oil-kit', title: 'Essential Oil Starter Kit', shortDescription: '6 pure essential oils for healing', longDescription: 'Starter kit with 6 pure essential oils: lavender, eucalyptus, peppermint, tea tree, lemon, and frankincense. Perfect for diffusing, massage, and aromatherapy.', pricePaise: 349900, categorySlug: 'aromatherapy' },
    { slug: 'sage-bundle', title: 'White Sage Smudge Bundle', shortDescription: 'Ethically sourced white sage', longDescription: 'Ethically sourced California white sage smudge bundle for energy clearing, space cleansing, and spiritual purification rituals.', pricePaise: 59900, categorySlug: 'aromatherapy' },
    { slug: 'yoga-mat-premium', title: 'Premium Yoga Mat', shortDescription: 'Eco-friendly non-slip yoga mat', longDescription: 'Professional-grade eco-friendly yoga mat made from natural rubber. Non-slip surface, 6mm thickness, with alignment markings. Includes carrying strap.', pricePaise: 449900, categorySlug: 'yoga-accessories' },
    { slug: 'yoga-blocks-set', title: 'Cork Yoga Blocks (Set of 2)', shortDescription: 'Sustainable cork yoga blocks', longDescription: 'Set of 2 sustainable cork yoga blocks for improved alignment and deeper stretches. Lightweight, durable, and eco-friendly.', pricePaise: 179900, categorySlug: 'yoga-accessories' },
    { slug: 'yoga-strap', title: 'Organic Cotton Yoga Strap', shortDescription: 'Adjustable yoga strap', longDescription: 'Organic cotton yoga strap with D-ring buckle for secure adjustments. 8-foot length ideal for stretching and flexibility work.', pricePaise: 79900, categorySlug: 'yoga-accessories' },
    { slug: 'chakra-stone-set', title: 'Chakra Crystal Set (7 Stones)', shortDescription: 'Complete 7-chakra crystal set', longDescription: 'Complete set of 7 genuine gemstones matched to each chakra center. Includes velvet pouch and chakra guide card.', pricePaise: 219900, categorySlug: 'crystals' },
    { slug: 'diffuser-ceramic', title: 'Ceramic Aroma Diffuser', shortDescription: 'Handmade ceramic essential oil diffuser', longDescription: 'Handmade ceramic essential oil diffuser with soft LED lighting. Covers up to 300 sq ft, whisper-quiet operation.', pricePaise: 279900, categorySlug: 'aromatherapy' },
  ]

  for (const p of productsData) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        slug: p.slug,
        title: p.title,
        shortDescription: p.shortDescription,
        longDescription: p.longDescription,
        pricePaise: p.pricePaise,
        categoryId: categoryRecords[p.categorySlug],
      },
    })
  }
  console.log('15 products created')

  // --- 10 Blog Posts ---
  const blogData = [
    { slug: 'what-is-reiki', title: 'What is Reiki and How Does It Work?', excerpt: 'Discover the ancient Japanese healing art of Reiki and its benefits.', content: 'Reiki is a Japanese energy healing technique that promotes relaxation and supports the body\'s natural healing processes. The word Reiki comes from the Japanese words "rei" (universal) and "ki" (life energy). During a Reiki session, the practitioner channels universal life energy through their hands to the recipient, clearing energy blockages and restoring balance.\n\nOrigins of Reiki trace back to Dr. Mikao Usui in the early 20th century. Today, millions worldwide practice Reiki for stress reduction, pain management, and spiritual growth. Research suggests Reiki may reduce anxiety, improve mood, and complement conventional medical treatments.\n\nA typical session lasts 60-90 minutes, with the client lying comfortably while the practitioner places their hands on or near the body.' },
    { slug: 'benefits-of-yoga-therapy', title: '5 Surprising Benefits of Yoga Therapy', excerpt: 'Yoga therapy goes beyond regular yoga—learn how it heals the body and mind.', content: 'Yoga therapy is a personalised approach to healing that adapts traditional yoga techniques to address specific health concerns. Unlike general yoga classes, yoga therapy sessions are tailored to your unique needs.\n\n1. **Chronic Pain Relief**: Studies show yoga therapy reduces chronic lower back pain, arthritis symptoms, and migraines through gentle movement and breath awareness.\n\n2. **Mental Health Support**: Yoga therapy techniques have been shown to reduce symptoms of depression and anxiety by regulating the nervous system.\n\n3. **Better Sleep**: Specific restorative poses and breathing techniques calm the mind, making yoga therapy effective for insomnia.\n\n4. **Digestive Health**: Targeted poses stimulate digestion and reduce symptoms of IBS and bloating.\n\n5. **Immune Boost**: Regular practice strengthens the immune response by reducing stress hormones and promoting lymphatic flow.' },
    { slug: 'understanding-chakras', title: 'A Beginner\'s Guide to Understanding Chakras', excerpt: 'Learn about the seven energy centres and how they affect your well-being.', content: 'Chakras are energy centres in the body that influence our physical, emotional, and spiritual health. The seven main chakras run along the spine from the base to the crown of the head.\n\n• Root Chakra (Muladhara): Security and survival\n• Sacral Chakra (Svadhisthana): Creativity and emotions\n• Solar Plexus Chakra (Manipura): Personal power and confidence\n• Heart Chakra (Anahata): Love and compassion\n• Throat Chakra (Vishuddha): Communication and truth\n• Third Eye Chakra (Ajna): Intuition and insight\n• Crown Chakra (Sahasrara): Spiritual connection\n\nWhen chakras are balanced, energy flows freely and we experience health and vitality. Blockages can manifest as physical symptoms, emotional disturbances, or spiritual disconnection.' },
    { slug: 'meditation-beginners', title: 'How to Start Meditating: A Practical Guide', excerpt: 'Simple steps to begin your meditation practice today.', content: 'Starting a meditation practice doesn\'t require special equipment or hours of free time. Here is a practical guide to begin.\n\n**Start Small**: Begin with just 5 minutes daily. Consistency matters more than duration. Set a timer and sit comfortably.\n\n**Focus on Breath**: The simplest technique is breath awareness. Notice your inhale and exhale without trying to change it. When your mind wanders (it will), gently return to the breath.\n\n**Choose a Time**: Morning meditation sets a calm tone for the day. Evening practice helps process the day\'s events. Pick what works for you.\n\n**Create Space**: Designate a quiet corner for practice. A cushion, a candle, or a small altar can signal to your brain that it\'s meditation time.\n\n**Be Patient**: The mind will wander—that\'s normal. Each time you notice and return to focus, you\'re building the meditation muscle.' },
    { slug: 'crystal-healing-guide', title: 'Crystal Healing: Science, Myths, and How to Get Started', excerpt: 'Everything you need to know about using crystals for healing.', content: 'Crystal healing is an alternative therapy that uses gemstones and crystals to promote physical, emotional, and spiritual well-being. While scientific evidence is limited, millions of practitioners report significant benefits.\n\n**How Crystals Work**: Practitioners believe crystals interact with the body\'s energy field, helping to remove blockages and restore balance. Each crystal has unique properties based on its mineral composition and structure.\n\n**Popular Healing Crystals**:\n- Amethyst: Calming, spiritual awareness\n- Rose Quartz: Love, emotional healing\n- Clear Quartz: Amplification, clarity\n- Black Tourmaline: Protection, grounding\n- Citrine: Abundance, confidence\n\n**Getting Started**: Choose a crystal that resonates with you intuitively. Cleanse it under running water or moonlight, set your intention, and carry it with you or place it in your space.' },
    { slug: 'hypnotherapy-explained', title: 'Hypnotherapy: What to Expect in Your First Session', excerpt: 'Demystifying clinical hypnotherapy and its therapeutic applications.', content: 'Clinical hypnotherapy is a scientifically recognised therapeutic technique that uses focused attention and guided relaxation to access the subconscious mind. It is not stage hypnosis—you remain in control throughout.\n\n**What Happens**: The therapist guides you into a deeply relaxed state where your subconscious mind becomes more receptive to positive suggestions and therapeutic work. Most people feel calm and focused, similar to the state just before falling asleep.\n\n**Common Uses**: Smoking cessation, weight management, anxiety and phobias, pain management, trauma processing, improving confidence, and breaking unwanted habits.\n\n**Your First Session**: Expect an initial consultation discussing your goals, followed by an induction into the hypnotic state, therapeutic work, and a gentle return to full awareness. Sessions typically last 60-90 minutes.' },
    { slug: 'sound-healing-science', title: 'The Science Behind Sound Healing', excerpt: 'How vibrations and frequencies promote healing and relaxation.', content: 'Sound healing is backed by a growing body of research showing how specific frequencies and vibrations affect our physiology and mental state.\n\n**Brainwave Entrainment**: Sound frequencies can entrain brainwaves to shift from beta (alert) to alpha (relaxed) or theta (meditative) states. This is why singing bowls and gongs produce such deep relaxation.\n\n**Vagus Nerve Stimulation**: Certain sounds stimulate the vagus nerve, activating the parasympathetic nervous system and reducing stress hormones.\n\n**Cellular Resonance**: Everything in the body vibrates at specific frequencies. Sound therapy aims to restore optimal vibrational patterns in cells and tissues.\n\n**Research Findings**: Studies show sound healing reduces chronic pain, lowers blood pressure, decreases anxiety, and improves quality of life in patients with various conditions.' },
    { slug: 'tarot-reading-guide', title: 'A Sceptic\'s Guide to Tarot Reading', excerpt: 'How tarot cards can be a powerful tool for self-reflection, even if you\'re a sceptic.', content: 'You don\'t need to believe in the supernatural to benefit from tarot. At its core, tarot is a tool for structured self-reflection and decision-making.\n\n**How It Works**: A standard tarot deck has 78 cards divided into Major Arcana (22 life-theme cards) and Minor Arcana (56 everyday-situation cards). The reader selects cards in a specific spread and interprets their symbolism in context.\n\n**Psychological Perspective**: Carl Jung saw tarot as connecting to the collective unconscious through archetypes. Modern psychologists view it as a projective technique—like a Rorschach test—where your interpretation reveals your subconscious thoughts.\n\n**Getting Value**: Approach a reading with an open question rather than a yes/no query. Use the cards as prompts for deeper thinking about your situation, relationships, and choices.' },
    { slug: 'pranayama-benefits', title: 'Pranayama: Ancient Breathing Techniques for Modern Stress', excerpt: 'Evidence-based benefits of yogic breathing practices.', content: 'Pranayama, the yogic science of breath control, offers powerful tools for managing stress, improving focus, and enhancing overall health.\n\n**Nadi Shodhana (Alternate Nostril)**: Balances the left and right hemispheres of the brain, reduces anxiety, and promotes calm. Practice for 5 minutes before bed for better sleep.\n\n**Kapalabhati (Skull Shining)**: Energising breath that clears the mind, improves digestion, and strengthens abdominal muscles. Best practiced in the morning on an empty stomach.\n\n**Box Breathing**: Inhale 4 counts, hold 4, exhale 4, hold 4. Used by Navy SEALs for stress management. Immediately activates the parasympathetic nervous system.\n\n**Bhramari (Bee Breath)**: Humming breath that soothes the nervous system, helps with insomnia, and reduces blood pressure. Research shows it increases nitric oxide production.' },
    { slug: 'self-care-rituals', title: '7 Self-Care Rituals from Ancient Healing Traditions', excerpt: 'Timeless wellness practices you can incorporate into your daily routine.', content: 'Ancient healing traditions offer time-tested self-care practices that remain powerful today.\n\n1. **Oil Pulling (Ayurveda)**: Swish coconut oil for 15 minutes each morning to detoxify, improve dental health, and boost immunity.\n\n2. **Forest Bathing (Shinrin-Yoku)**: Slow, mindful walks in nature reduce cortisol, boost NK cells, and improve mood. 2 hours per week shows significant benefits.\n\n3. **Dry Brushing (Ayurveda)**: Brush skin before bathing to stimulate lymphatic flow, improve circulation, and exfoliate. Always brush toward the heart.\n\n4. **Journaling (Multiple traditions)**: Write 3 pages each morning or 3 gratitudes each evening. Both practices reduce anxiety and increase self-awareness.\n\n5. **Cold Water Therapy (Nordic)**: Brief cold exposure strengthens immunity, improves circulation, and releases endorphins.\n\n6. **Abhyanga Self-Massage (Ayurveda)**: Warm sesame oil massage before bathing nourishes the skin and calms the nervous system.\n\n7. **Tea Ceremony (Japanese/Chinese)**: Mindful tea preparation and drinking as a meditation practice, fostering presence and gratitude.' },
  ]

  for (const b of blogData) {
    await prisma.blogPost.upsert({
      where: { slug: b.slug },
      update: {},
      create: b,
    })
  }
  console.log('10 blog posts created')

  // --- 20 Audio Tracks ---
  const audioData = [
    { slug: 'morning-meditation', title: 'Morning Meditation', description: 'Start your day with clarity and intention. A gentle 10-minute guided meditation.', category: 'Meditation', audioUrl: '/audio/morning-meditation.mp3', duration: 600, isPremium: false },
    { slug: 'deep-relaxation', title: 'Deep Relaxation Body Scan', description: 'Progressive body scan for complete physical and mental relaxation.', category: 'Relaxation', audioUrl: '/audio/deep-relaxation.mp3', duration: 1200, isPremium: false },
    { slug: 'chakra-balancing', title: 'Chakra Balancing Meditation', description: 'Guided visualization to balance and energize all seven chakras.', category: 'Meditation', audioUrl: '/audio/chakra-balancing.mp3', duration: 900, isPremium: true },
    { slug: 'sleep-soundscape', title: 'Sleep Soundscape', description: 'Soothing nature sounds and gentle tones to guide you into restful sleep.', category: 'Sleep', audioUrl: '/audio/sleep-soundscape.mp3', duration: 1800, isPremium: false },
    { slug: 'singing-bowl-session', title: 'Singing Bowl Session', description: 'Tibetan singing bowl sounds for deep meditation and energy clearing.', category: 'Sound Healing', audioUrl: '/audio/singing-bowl.mp3', duration: 1500, isPremium: true },
    { slug: 'breath-awareness', title: 'Breath Awareness Practice', description: 'Simple guided breathing exercise to anchor your attention and calm the mind.', category: 'Breathwork', audioUrl: '/audio/breath-awareness.mp3', duration: 480, isPremium: false },
    { slug: 'loving-kindness', title: 'Loving-Kindness Meditation', description: 'Cultivate compassion and kindness toward yourself and others.', category: 'Meditation', audioUrl: '/audio/loving-kindness.mp3', duration: 720, isPremium: false },
    { slug: 'forest-walk', title: 'Forest Walk Visualization', description: 'Guided imagery through a peaceful forest for stress relief.', category: 'Relaxation', audioUrl: '/audio/forest-walk.mp3', duration: 900, isPremium: false },
    { slug: 'anxiety-relief', title: 'Anxiety Relief Breathing', description: 'Calming breathwork techniques specifically designed to reduce anxiety.', category: 'Breathwork', audioUrl: '/audio/anxiety-relief.mp3', duration: 600, isPremium: false },
    { slug: 'energy-boost', title: 'Energy Boost Meditation', description: 'Quick energizing meditation to recharge during a busy day.', category: 'Meditation', audioUrl: '/audio/energy-boost.mp3', duration: 360, isPremium: false },
    { slug: 'gong-bath', title: 'Gong Bath Experience', description: 'Immersive gong bath recording for deep healing and nervous system reset.', category: 'Sound Healing', audioUrl: '/audio/gong-bath.mp3', duration: 2400, isPremium: true },
    { slug: 'yoga-nidra', title: 'Yoga Nidra (Yogic Sleep)', description: 'Guided yoga nidra session for deep conscious relaxation equivalent to hours of sleep.', category: 'Meditation', audioUrl: '/audio/yoga-nidra.mp3', duration: 1800, isPremium: true },
    { slug: 'rain-sleep', title: 'Rain Sounds for Sleep', description: 'Two hours of gentle rain sounds to help you fall and stay asleep.', category: 'Sleep', audioUrl: '/audio/rain-sleep.mp3', duration: 7200, isPremium: false },
    { slug: 'mantra-chanting', title: 'Om Mantra Chanting', description: 'Traditional Om chanting session for spiritual practice and meditation enhancement.', category: 'Sound Healing', audioUrl: '/audio/mantra-chanting.mp3', duration: 1200, isPremium: true },
    { slug: 'gratitude-meditation', title: 'Gratitude Meditation', description: 'Guided practice to cultivate deep gratitude and positive mindset.', category: 'Meditation', audioUrl: '/audio/gratitude.mp3', duration: 600, isPremium: false },
    { slug: 'stress-release-breath', title: 'Stress Release Breathwork', description: 'Active breathwork session to release stored tension and emotional stress.', category: 'Breathwork', audioUrl: '/audio/stress-release.mp3', duration: 900, isPremium: true },
    { slug: 'ocean-waves', title: 'Ocean Waves Ambient', description: 'Calming ocean wave recordings for meditation, study, or relaxation.', category: 'Relaxation', audioUrl: '/audio/ocean-waves.mp3', duration: 3600, isPremium: false },
    { slug: 'third-eye-activation', title: 'Third Eye Activation', description: 'Guided meditation focusing on the Ajna chakra to enhance intuition.', category: 'Meditation', audioUrl: '/audio/third-eye.mp3', duration: 720, isPremium: true },
    { slug: 'bedtime-story', title: 'Healing Bedtime Story', description: 'Soothing narrated story with calming music for peaceful sleep.', category: 'Sleep', audioUrl: '/audio/bedtime-story.mp3', duration: 1500, isPremium: false },
    { slug: 'tuning-fork-healing', title: 'Tuning Fork Healing Session', description: 'Therapeutic tuning fork frequencies for physical and energetic healing.', category: 'Sound Healing', audioUrl: '/audio/tuning-fork.mp3', duration: 1200, isPremium: true },
  ]

  for (const a of audioData) {
    await prisma.audioTrack.upsert({ where: { slug: a.slug }, update: {}, create: a })
  }
  console.log('20 audio tracks created')

  console.log('✅ Full seed completed successfully!')
  console.log(`
📊 Created:
- 2 Users (1 admin, 1 regular user)
- 5 Healers with availability JSON
- 10 Services
- 6 Programs
- 8 Courses with lessons
- 15 Products (4 categories)
- 10 Blog Posts
- 20 Audio Tracks
- 2 Membership Plans
- Analytics demo data
`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })