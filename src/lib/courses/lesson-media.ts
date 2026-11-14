/** Accept saved embed links, common share links, and direct video files in the same lesson field. */
export function lessonMedia(value: string | null) {
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  if (/\.(?:mp4|m4v|webm|ogv)$/i.test(url.pathname)) return { kind: 'video', src: url.href } as const

  const youtube = ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)
  const parts = url.pathname.split('/')
  let id: string | null = null
  if (url.hostname === 'youtu.be') id = parts[1]
  if (youtube && parts[1] === 'shorts') id = parts[2]
  if (youtube && url.pathname === '/watch') id = url.searchParams.get('v')
  if (id && /^[\w-]{11}$/.test(id)) {
    const embed = new URL('https://www.youtube-nocookie.com/embed/' + id)
    const start = url.searchParams.get('start') ?? url.searchParams.get('t')
    if (start && /^\d+s?$/.test(start)) embed.searchParams.set('start', start.replace(/s$/, ''))
    return { kind: 'embed', src: embed.href } as const
  }
  const vimeo = ['vimeo.com', 'www.vimeo.com'].includes(url.hostname)
  const share = vimeo && /^\/(\d+)(?:\/([a-zA-Z0-9]+))?\/?$/.exec(url.pathname)
  if (share) {
    const embed = new URL('https://player.vimeo.com/video/' + share[1])
    const hash = share[2] ?? url.searchParams.get('h')
    if (hash) embed.searchParams.set('h', hash)
    return { kind: 'embed', src: embed.href } as const
  }
  return { kind: 'embed', src: url.href } as const
}
