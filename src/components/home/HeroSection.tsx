import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowUpRight, BookOpen, CalendarDays, Headphones, Sparkles } from "lucide-react"

const pathways = [
  {
    label: "Personal healing sessions",
    description: "Explore one-to-one services and practitioners.",
    href: "/services",
    icon: CalendarDays,
    accent: "from-violet-400/30 to-fuchsia-300/10",
  },
  {
    label: "Guided transformation",
    description: "Find structured, multi-session programs.",
    href: "/programs",
    icon: Sparkles,
    accent: "from-emerald-400/30 to-teal-300/10",
  },
  {
    label: "Learn at your pace",
    description: "Browse courses and individual lessons.",
    href: "/courses",
    icon: BookOpen,
    accent: "from-sky-400/30 to-blue-300/10",
  },
  {
    label: "Find a moment of calm",
    description: "Listen to guided audio and meditations.",
    href: "/audio",
    icon: Headphones,
    accent: "from-amber-400/30 to-orange-300/10",
  },
] as const

export default function HeroSection() {
  return (
    <section aria-labelledby="hero-heading" className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white shadow-xl">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-44 size-[28rem] rounded-full bg-emerald-400/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 left-1/3 size-[25rem] rounded-full bg-indigo-400/15 blur-3xl" />

      <div className="relative grid items-center gap-12 px-6 py-14 sm:px-10 md:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16 lg:px-14">
        <div className="max-w-2xl">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">
            <Sparkles aria-hidden="true" className="size-4" />
            Holistic Healing Marketplace
          </p>
          <h1 id="hero-heading" className="max-w-[15ch] text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl">
            Transform Your Mind, Body &amp; Spirit
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-200 sm:text-lg">
            Connect with healing practitioners, explore guided programs,
            learn new wellness practices, and find support for your journey.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild size="lg" className="focus-ring bg-emerald-400 px-7 text-base font-semibold text-slate-950 hover:bg-emerald-300">
              <Link href="/services">
                <Sparkles aria-hidden="true" className="mr-2 size-5" />
                Start Your Healing Journey
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="focus-ring border-white/40 bg-transparent px-7 text-base text-white hover:bg-white/10 hover:text-white">
              <Link href="/audio">
                <Headphones aria-hidden="true" className="mr-2 size-5" />
                Explore Free Audio
              </Link>
            </Button>
          </div>

          <p className="mt-8 text-sm text-slate-300">
            Explore free content before deciding which services fit your needs.
          </p>
        </div>

        <div className="relative">
          <div className="rounded-[1.5rem] border border-white/20 bg-white/10 p-4 shadow-2xl backdrop-blur-sm sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Discover your path</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">How would you like to begin?</h2>
              </div>
              <Sparkles aria-hidden="true" className="hidden size-7 shrink-0 text-emerald-200 sm:block" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {pathways.map(pathway => (
                <Link
                  key={pathway.href}
                  href={pathway.href}
                  className={`group flex min-h-40 flex-col rounded-2xl border border-white/15 bg-gradient-to-br ${pathway.accent} p-4 transition hover:border-white/50 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 text-emerald-50">
                      <pathway.icon aria-hidden="true" className="size-5" />
                    </span>
                    <ArrowUpRight aria-hidden="true" className="size-4 text-white/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                  <span className="mt-4 text-base font-semibold leading-snug">{pathway.label}</span>
                  <span className="mt-1 text-xs leading-relaxed text-slate-200">{pathway.description}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
