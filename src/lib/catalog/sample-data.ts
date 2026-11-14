/**
 * Catalog-only sample content shared by both seed flows.
 * These are examples for isolated development databases; they are not approved
 * production listings or finished course material.
 */
export type SampleService = {
  name: string
  slug: string
  description: string
  tagline: string
  category: string
  price: number
  duration: number
  mode: 'ONLINE' | 'OFFLINE' | 'BOTH'
  benefits: string[]
}

export const sampleServices: SampleService[] = [
{
      name: 'Yoga Therapy',
      slug: 'yoga-therapy',
      description: 'Therapeutic yoga sessions designed to address specific physical and mental health concerns. Combines traditional yoga poses with modern therapeutic techniques.',
      tagline: 'Healing through mindful movement and breath',
      category: 'Movement & Body',
      price: 8000, // ₹80 in paise
      duration: 75, // minutes
  mode: 'BOTH',
      benefits: [
        'Improves flexibility and strength',
        'Reduces chronic pain and tension',
        'Enhances mental clarity and focus',
        'Supports emotional regulation',
        'Promotes better sleep quality'
      ]
    },
    {
      name: 'Art Therapy',
      slug: 'art-therapy',
      description: 'Creative expression therapy using various art mediums to explore emotions, reduce stress, and promote healing. No artistic experience required.',
      tagline: 'Healing through creative expression',
      category: 'Creative Arts',
      price: 7500, // ₹75 in paise
      duration: 90,
  mode: 'BOTH',
      benefits: [
        'Processes emotions through creativity',
        'Reduces anxiety and depression',
        'Enhances self-awareness',
        'Improves communication skills',
        'Builds confidence and self-esteem'
      ]
    },
    {
      name: 'Reiki Healing',
      slug: 'reiki-healing',
      description: 'Traditional Japanese energy healing technique that promotes relaxation, reduces stress, and supports the body\'s natural healing processes.',
      tagline: 'Universal life energy for healing and balance',
      category: 'Energy Healing',
      price: 7000, // ₹70 in paise
      duration: 60,
  mode: 'BOTH',
      benefits: [
        'Deep relaxation and stress relief',
        'Balances energy centers (chakras)',
        'Supports physical healing',
        'Enhances emotional well-being',
        'Improves sleep and reduces fatigue'
      ]
    },
    {
      name: 'Tarot Reading',
      slug: 'tarot-reading',
      description: 'Intuitive tarot card readings to gain insights into life situations, relationships, and future possibilities. Provides guidance and clarity.',
      tagline: 'Divine guidance for life\'s questions',
      category: 'Divination',
      price: 5000, // ₹50 in paise
      duration: 45,
  mode: 'BOTH',
      benefits: [
        'Clarity on life decisions',
        'Insight into relationships',
        'Understanding of life patterns',
        'Guidance for personal growth',
        'Connection to intuitive wisdom'
      ]
    },
    {
      name: 'Hypnotherapy',
      slug: 'hypnotherapy',
      description: 'Professional hypnotherapy sessions for habit change, trauma healing, and personal transformation. Safe and effective therapeutic approach.',
      tagline: 'Transform your mind, transform your life',
      category: 'Therapy',
      price: 9000, // ₹90 in paise
      duration: 90,
      mode: 'BOTH',
      benefits: [
        'Overcome limiting beliefs',
        'Break unwanted habits',
        'Heal emotional trauma',
        'Improve confidence and motivation',
        'Access subconscious resources'
      ]
    },
    {
      name: 'Movement Therapy',
      slug: 'movement-therapy',
      description: 'Somatic movement therapy to release physical tension, improve body awareness, and restore natural movement patterns.',
      tagline: 'Free your body, free your mind',
      category: 'Movement & Body',
      price: 8500, // ₹85 in paise
      duration: 75,
  mode: 'OFFLINE',
      benefits: [
        'Releases chronic tension patterns',
        'Improves posture and alignment',
        'Enhances body awareness',
        'Reduces pain and stiffness',
        'Restores natural movement'
      ]
    },
    {
      name: 'Prana Healing',
      slug: 'prana-healing',
      description: 'Ancient energy healing system that works with life force energy (prana) to cleanse, energize, and balance the energy body.',
      tagline: 'Harness your life force for healing',
      category: 'Energy Healing',
      price: 7500, // ₹75 in paise
      duration: 60,
  mode: 'BOTH',
      benefits: [
        'Cleanses and energizes chakras',
        'Accelerates physical healing',
        'Improves emotional stability',
        'Enhances mental clarity',
        'Strengthens the energy body'
      ]
    },
{
      name: 'Crystal Healing',
      slug: 'crystal-healing',
      description: 'Harness the vibrational energy of crystals to clear energy blockages, promote chakra alignment, and support emotional well-being.',
      tagline: 'Align your energy with earths crystals',
      category: 'Energy Healing',
      price: 6500,
      duration: 60,
      mode: 'OFFLINE',
      benefits: ['Balances chakra energy', 'Promotes deep relaxation', 'Reduces anxiety', 'Supports emotional healing', 'Enhances meditation'],
    },
    {
      name: 'Sound Bath',
      slug: 'sound-bath',
      description: 'Immersive sound healing experience using singing bowls, gongs, and tuning forks for deep relaxation and nervous system reset.',
      tagline: 'Vibrational healing for body and mind',
      category: 'Energy Healing',
      price: 7000,
      duration: 75,
      mode: 'OFFLINE',
      benefits: ['Deep relaxation', 'Reduces stress hormones', 'Improves sleep quality', 'Calms the nervous system', 'Enhances mindfulness'],
    },
    {
      name: 'Meditation Coaching',
      slug: 'meditation-coaching',
      description: 'Personalized meditation coaching to build a sustainable practice. Covers mindfulness, loving-kindness, and transcendental techniques.',
      tagline: 'Build your daily meditation practice',
      category: 'Mindfulness',
      price: 6000,
      duration: 60,
      mode: 'ONLINE',
      benefits: ['Custom meditation plan', 'Guided techniques', 'Stress reduction', 'Improved focus', 'Emotional resilience'],
    },
]

export type SampleProgram = {
  slug: string
  title: string
  description: string
  pricePaise: number
  totalSessions: number
  sessionsPerWeek: number
  durationMinutes: number
}

export const samplePrograms: SampleProgram[] = [
{ slug: 'stress-release-21', title: '21-Day Stress Release', description: 'A structured 3-week program combining yoga, breathwork, and meditation to drastically reduce stress levels and improve daily well-being.', pricePaise: 499900, totalSessions: 21, sessionsPerWeek: 7, durationMinutes: 30 },
    { slug: 'chakra-alignment', title: 'Chakra Alignment Program', description: 'Heal and balance all seven major chakras through energy work, guided meditations, and specific yoga sequences over 8 intensive sessions.', pricePaise: 799900, totalSessions: 8, sessionsPerWeek: 2, durationMinutes: 60 },
    { slug: 'trauma-release-12', title: '12-Session Trauma Release', description: 'Professionally guided somatic and hypnotherapy program to safely process and release stored trauma from the body and mind.', pricePaise: 1199900, totalSessions: 12, sessionsPerWeek: 2, durationMinutes: 75 },
    { slug: 'spiritual-awakening', title: 'Spiritual Awakening Journey', description: 'Four-week intensive blending Reiki, tarot, meditation, and journaling to deepen your spiritual connection and discover your higher purpose.', pricePaise: 699900, totalSessions: 16, sessionsPerWeek: 4, durationMinutes: 45 },
    { slug: 'art-expression', title: 'Creative Expression Workshop', description: 'Six-session art therapy workshop exploring emotions through painting, collage, and mandala creation. No artistic skill required.', pricePaise: 399900, totalSessions: 6, sessionsPerWeek: 2, durationMinutes: 90 },
    { slug: 'movement-mastery', title: 'Movement Mastery Program', description: 'Eight-week somatic movement program restoring natural movement patterns, improving posture, and releasing chronic muscular tension.', pricePaise: 899900, totalSessions: 16, sessionsPerWeek: 2, durationMinutes: 60 },
]

export type SampleCourse = {
  slug: string
  title: string
  description: string
  pricePaise: number
  lessons: string[]
}

export const sampleCourses: SampleCourse[] = [
{ slug: 'intro-to-reiki', title: 'Introduction to Reiki', description: 'Learn the fundamentals of Reiki energy healing, hand positions, and self-healing techniques in this comprehensive beginner course.', pricePaise: 299900, lessons: ['What is Reiki?', 'History & Principles', 'Sensing Energy', 'Hand Positions', 'Self-Healing Practice'] },
    { slug: 'yoga-foundations', title: 'Yoga Foundations', description: 'Master the essential yoga poses, breathwork, and alignment principles to build a safe and effective home practice.', pricePaise: 199900, lessons: ['Breath & Alignment', 'Standing Poses', 'Seated Poses', 'Balance & Inversions', 'Building a Routine'] },
    { slug: 'tarot-for-beginners', title: 'Tarot for Beginners', description: 'Comprehensive guide to reading tarot cards, understanding the Major and Minor Arcana, and developing your intuitive reading skills.', pricePaise: 249900, lessons: ['Deck Overview', 'Major Arcana', 'Minor Arcana', 'Spreads & Layouts', 'Intuitive Reading'] },
    { slug: 'meditation-masterclass', title: 'Meditation Masterclass', description: 'Explore 10 meditation techniques from mindfulness to transcendental, with guided sessions to deepen your practice.', pricePaise: 349900, lessons: ['Mindfulness Basics', 'Breath Awareness', 'Body Scan', 'Loving-Kindness', 'Transcendental Meditation', 'Walking Meditation'] },
    { slug: 'crystal-healing-course', title: 'Crystal Healing Course', description: 'Discover the healing properties of crystals, learn to create crystal grids, and use stones for chakra balancing.', pricePaise: 279900, lessons: ['Crystal Basics', 'Choosing Crystals', 'Chakra Crystals', 'Crystal Grids', 'Cleansing & Programming'] },
    { slug: 'art-therapy-essentials', title: 'Art Therapy Essentials', description: 'Foundational art therapy techniques for personal healing and emotional expression using drawing, painting, and collage.', pricePaise: 329900, lessons: ['Art as Therapy', 'Drawing Emotions', 'Colour Psychology', 'Collage Healing', 'Mandala Creation'] },
    { slug: 'pranayama-breathing', title: 'Pranayama & Breathing', description: 'Master the ancient science of breath control with techniques for energy, calm, and mental clarity.', pricePaise: 179900, lessons: ['Diaphragmatic Breathing', 'Nadi Shodhana', 'Kapalabhati', 'Bhramari', 'Kumbhaka'] },
    { slug: 'sound-healing-basics', title: 'Sound Healing Basics', description: 'Introduction to sound healing with singing bowls, tuning forks, and vocal toning for relaxation and self-care.', pricePaise: 259900, lessons: ['Science of Sound', 'Singing Bowls', 'Tuning Forks', 'Vocal Toning', 'Creating a Sound Session'] },
]
