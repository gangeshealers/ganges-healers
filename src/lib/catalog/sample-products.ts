/**
 * Unapproved, development-only store catalog fixtures. Reused by both the
 * complete demo seed and the opt-in public catalog setup command.
 * These are not real inventory, procurement claims or published product copy.
 */
export type SampleProductCategory = { slug: string; title: string }
export type SampleProduct = {
  slug: string
  title: string
  shortDescription: string
  longDescription: string
  pricePaise: number
  categorySlug: string
}

export const sampleProductCategories: SampleProductCategory[] = [
{ slug: 'crystals', title: 'Crystals & Stones' },
    { slug: 'meditation-tools', title: 'Meditation Tools' },
    { slug: 'yoga-accessories', title: 'Yoga Accessories' },
    { slug: 'aromatherapy', title: 'Aromatherapy' },
]

export const sampleProducts: SampleProduct[] = [
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
