import { lessonMedia } from '@/lib/courses/lesson-media'

test('renders author-entered video files and share links as playable lesson sources', () => {
  const file = 'https://media.example.test/course/introduction.mp4?version=2'
  expect(lessonMedia(file)).toEqual({ kind: 'video', src: file })
  expect(lessonMedia('https://youtu.be/abcdefghijk?t=34s')?.src).toBe(
    'https://www.youtube-nocookie.com/embed/abcdefghijk?start=34',
  )
  expect(lessonMedia('https://vimeo.com/12345')?.src).toBe('https://player.vimeo.com/video/12345')
  expect(lessonMedia('https://vimeo.com/12345/abc123')?.src).toBe(
    'https://player.vimeo.com/video/12345?h=abc123',
  )
  const embed = 'https://player.example.test/embed/lesson'
  expect(lessonMedia(embed)).toEqual({ kind: 'embed', src: embed })
  expect(lessonMedia('invalid stored value')).toBeNull()
})
