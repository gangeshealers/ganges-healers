// components/services/ServicesGrid.tsx
import Link from 'next/link'
import Image from 'next/image'
import { Clock, Star, Users, ArrowRight, Sparkles } from 'lucide-react'

interface Service {
  id: string
  name: string
  slug: string
  description: string
  price: number
  duration: number
  image?: string
  category: string
  mode?: 'ONLINE' | 'OFFLINE' | 'BOTH'
  averageRating: number | null
  totalSessions: number
  totalReviews: number
}

export default function ServicesGrid({ services }: { services: Service[] }) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {services.map((service) => (
        <Link 
          key={service.id} 
          href={`/services/${service.slug}`}
          className="group"
          data-test="service-card"
          data-service-slug={service.slug}
        >
          <div className="bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden h-full flex flex-col">
            {/* Image */}
            <div className="relative h-48 overflow-hidden bg-gradient-to-br from-emerald-800 via-teal-700 to-cyan-700">
              {service.image?.trim() ? (
                <Image
                  src={service.image.trim()}
                  alt={service.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div data-testid="service-card-image-fallback" aria-hidden="true" className="flex h-full w-full flex-col items-center justify-center gap-2 text-white">
                  <Sparkles className="size-9 text-emerald-100" />
                  <span className="text-base font-semibold tracking-wide">Ganges Healers</span>
                </div>
              )}
              <div className="absolute top-4 left-4">
                <span className="bg-white/90 backdrop-blur px-3 py-1 rounded-full text-sm font-medium">
                  {service.category}
                </span>
              </div>
              {service.mode && (
                <span data-testid="service-card-format" className="absolute bottom-3 left-4 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-medium text-white">
                  {service.mode === 'BOTH' ? 'Online & in person' : service.mode === 'ONLINE' ? 'Online' : 'In person'}
                </span>
              )}
            </div>
            
            {/* Content */}
            <div className="p-6 flex-1 flex flex-col">
              <h3 className="text-xl font-bold text-gray-800 mb-2 group-hover:text-purple-600 transition-colors">
                {service.name}
              </h3>
              
              <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                {service.description}
              </p>
              
              {/* Stats */}
              <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{service.duration}min</span>
                </div>
                <div className="flex items-center gap-1">
                  {service.averageRating !== null && service.totalReviews > 0 ? <>
                    <Star className="w-4 h-4 text-yellow-400" aria-hidden="true" />
                    <span aria-label={`${service.averageRating.toFixed(1)} out of 5 from ${service.totalReviews} ${service.totalReviews === 1 ? 'review' : 'reviews'}`}>{service.averageRating.toFixed(1)} ({service.totalReviews})</span>
                  </> : <span>No reviews yet</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span>{service.totalSessions}</span>
                </div>
              </div>
              
              {/* Price and CTA */}
              <div className="mt-auto flex items-center justify-between">
                <div>
                  <span className="text-2xl font-bold text-purple-600">
                    ₹{service.price.toLocaleString()}
                  </span>
                  <span className="text-gray-500 text-sm ml-1">
                    /session
                  </span>
                </div>
                <span className="text-purple-600 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                  View Details
                  <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
