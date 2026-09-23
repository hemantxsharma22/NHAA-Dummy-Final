import React from 'react'

interface FormattedMessageProps {
  text: string
  isUser?: boolean
  className?: string
}

export const FormattedMessage: React.FC<FormattedMessageProps> = ({
  text,
  isUser = false,
  className = '',
}) => {
  if (!text) return null

  // Helper to parse inline bold (**text**), links, and strip unwanted raw asterisks
  const renderInline = (str: string, keyPrefix: string): React.ReactNode => {
    if (!str) return null

    // Split on URLs
    const urlRegex = /(https?:\/\/[^\s)]+)/g
    const urlParts = str.split(urlRegex)

    return urlParts.map((urlPart, urlIdx) => {
      if (urlPart.match(urlRegex)) {
        return (
          <a
            key={`${keyPrefix}-url-${urlIdx}`}
            href={urlPart}
            target="_blank"
            rel="noopener noreferrer"
            className={
              isUser
                ? 'underline text-blue-200 hover:text-white break-all'
                : 'underline text-emerald-700 hover:text-emerald-900 font-medium break-all'
            }
          >
            {urlPart}
          </a>
        )
      }

      // Split on **bold text**
      const boldRegex = /(\*\*[^*]+?\*\*)/g
      const boldParts = urlPart.split(boldRegex)

      return boldParts.map((part, boldIdx) => {
        const uniqueKey = `${keyPrefix}-${urlIdx}-${boldIdx}`
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          const content = part.slice(2, -2)
          return (
            <strong
              key={uniqueKey}
              className={`font-semibold ${isUser ? 'text-white' : 'text-slate-900'}`}
            >
              {content}
            </strong>
          )
        }

        // Clean any stray orphaned asterisks so raw ** is never exposed to user
        const cleaned = part.replace(/\*\*/g, '')
        return <React.Fragment key={uniqueKey}>{cleaned}</React.Fragment>
      })
    })
  }

  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []

  let currentList: { type: 'bullet' | 'number'; items: React.ReactNode[] } | null = null

  const flushList = () => {
    if (!currentList) return
    const key = `list-${blocks.length}`
    if (currentList.type === 'bullet') {
      blocks.push(
        <ul key={key} className="space-y-1.5 my-2 pl-1">
          {currentList.items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span
                className={`select-none mt-0.5 text-base leading-none flex-shrink-0 ${
                  isUser ? 'text-white/70' : 'text-emerald-600'
                }`}
              >
                •
              </span>
              <div className="flex-1 leading-relaxed">{item}</div>
            </li>
          ))}
        </ul>
      )
    } else {
      blocks.push(
        <ol key={key} className="space-y-1.5 my-2 pl-1">
          {currentList.items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span
                className={`select-none font-bold text-xs mt-0.5 min-w-[1.2rem] flex-shrink-0 ${
                  isUser ? 'text-white/80' : 'text-emerald-700'
                }`}
              >
                {idx + 1}.
              </span>
              <div className="flex-1 leading-relaxed">{item}</div>
            </li>
          ))}
        </ol>
      )
    }
    currentList = null
  }

  lines.forEach((rawLine, lineIdx) => {
    const trimmed = rawLine.trim()

    // Horizontal line: --- or *** or ___
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushList()
      blocks.push(
        <hr
          key={`hr-${lineIdx}`}
          className={`my-2.5 border-t ${isUser ? 'border-white/20' : 'border-slate-200'}`}
        />
      )
      return
    }

    // Markdown Headers: #, ##, ###, ####
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (headerMatch) {
      flushList()
      const title = headerMatch[2].replace(/\*\*/g, '').trim()
      blocks.push(
        <div
          key={`header-${lineIdx}`}
          className={`font-bold mt-2.5 mb-1 ${
            headerMatch[1].length <= 2 ? 'text-base' : 'text-sm'
          } ${isUser ? 'text-white' : 'text-slate-900'}`}
        >
          {renderInline(title, `h-${lineIdx}`)}
        </div>
      )
      return
    }

    // Bullet points: -, *, •
    const bulletMatch = rawLine.match(/^\s*[-*•]\s+(.*)$/)
    if (bulletMatch) {
      if (currentList && currentList.type !== 'bullet') flushList()
      if (!currentList) currentList = { type: 'bullet', items: [] }
      currentList.items.push(renderInline(bulletMatch[1], `b-${lineIdx}`))
      return
    }

    // Numbered list: 1., 2., etc.
    const numberMatch = rawLine.match(/^\s*\d+\.\s+(.*)$/)
    if (numberMatch) {
      if (currentList && currentList.type !== 'number') flushList()
      if (!currentList) currentList = { type: 'number', items: [] }
      currentList.items.push(renderInline(numberMatch[1], `n-${lineIdx}`))
      return
    }

    // Empty line
    if (!trimmed) {
      flushList()
      blocks.push(<div key={`empty-${lineIdx}`} className="h-1.5" />)
      return
    }

    // Regular line / paragraph
    flushList()
    blocks.push(
      <p key={`p-${lineIdx}`} className="leading-relaxed">
        {renderInline(rawLine, `p-${lineIdx}`)}
      </p>
    )
  })

  flushList()

  return <div className={`space-y-1 ${className}`}>{blocks}</div>
}
