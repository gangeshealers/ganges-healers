import { lessonMedia } from '@/lib/courses/lesson-media'

type LessonBodyProps = {
  lesson: { title: string; content: string | null; videoUrl: string | null }
  preview?: boolean
}

const trustedPlayers = new Set([
  'https://www.youtube-nocookie.com',
  'https://www.youtube.com',
  'https://player.vimeo.com',
])

export default function LessonBody({ lesson, preview }: LessonBodyProps) {
  const media = lessonMedia(lesson.videoUrl)
  return (
    <>
      <h1 className="mb-4 break-words text-2xl font-bold">{lesson.title}</h1>
      {media && (
        <div className="mb-6 aspect-video overflow-hidden rounded-lg bg-black">
          {media.kind === 'video' ? (
            <video
              className="h-full w-full"
              aria-label={lesson.title}
              src={media.src}
              controls
              preload="metadata"
              playsInline
            />
          ) : (
            <iframe
              src={media.src}
              className="h-full w-full"
              allowFullScreen
              sandbox={
                preview && !trustedPlayers.has(new URL(media.src).origin)
                  ? 'allow-scripts allow-presentation'
                  : undefined
              }
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              title={lesson.title}
            />
          )}
        </div>
      )}
      {lesson.content && (
        <div className="prose mb-6 max-w-none whitespace-pre-line break-words">{lesson.content}</div>
      )}
    </>
  )
}
