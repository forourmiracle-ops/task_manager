import { memo } from 'react'

/**
 * Lightweight Markdown-like renderer.
 * Supports: **bold**, *italic*, `code`, - list items, # headings, line breaks
 */
function renderLine(line: string, key: number): React.ReactNode {
  // Heading
  if (/^#{1,3}\s/.test(line)) {
    const level = line.match(/^(#{1,3})/)![1].length
    const text = line.replace(/^#{1,3}\s/, '')
    const sizes = ['text-sm', 'text-xs', 'text-xs']
    const weights = ['font-bold', 'font-semibold', 'font-medium']
    return (
      <div key={key} className={`${sizes[level - 1]} ${weights[level - 1]} mt-1.5 first:mt-0`}>
        {renderInline(text)}
      </div>
    )
  }

  // Unordered list item
  if (/^[-*]\s/.test(line)) {
    const text = line.replace(/^[-*]\s/, '')
    return (
      <div key={key} className="flex items-start gap-2 text-xs ml-1">
        <span className="text-muted-foreground mt-0.5 flex-shrink-0">•</span>
        <span>{renderInline(text)}</span>
      </div>
    )
  }

  // Ordered list item
  if (/^\d+\.\s/.test(line)) {
    const match = line.match(/^(\d+)\.\s(.*)/)
    if (match) {
      return (
        <div key={key} className="flex items-start gap-2 text-xs ml-1">
          <span className="text-muted-foreground mt-0.5 flex-shrink-0 min-w-[1.2em]">{match[1]}.</span>
          <span>{renderInline(match[2])}</span>
        </div>
      )
    }
  }

  // Code block start/end
  if (line.trim().startsWith('```')) {
    return null
  }

  // Empty line
  if (!line.trim()) {
    return <div key={key} className="h-2" />
  }

  // Regular text
  return <div key={key} className="text-xs leading-relaxed">{renderInline(line)}</div>
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let idx = 0

  while (remaining.length > 0) {
    // Bold **text**
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*/)
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={idx++}>{boldMatch[1]}</span>)
      parts.push(<strong key={idx++} className="font-bold">{boldMatch[2]}</strong>)
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    // Italic *text*
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*/)
    if (italicMatch) {
      if (italicMatch[1]) parts.push(<span key={idx++}>{italicMatch[1]}</span>)
      parts.push(<em key={idx++}>{italicMatch[2]}</em>)
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }

    // Inline code `text`
    const codeMatch = remaining.match(/^(.*?)`(.+?)`/)
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<span key={idx++}>{codeMatch[1]}</span>)
      parts.push(
        <code key={idx++} className="px-1 py-0.5 rounded bg-muted/50 text-[11px] font-mono text-primary/80">
          {codeMatch[2]}
        </code>
      )
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    // Plain text remainder
    parts.push(<span key={idx++}>{remaining}</span>)
    break
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}

export const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  // Detect if content is inside a code block
  const lines = content.split('\n')
  let inCodeBlock = false
  const codeBlocks: string[] = []
  const renderedLines: React.ReactNode[] = []

  let lineIdx = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        renderedLines.push(
          <pre key={`code-${lineIdx++}`} className="bg-muted/30 rounded-lg p-3 my-2 text-[11px] font-mono leading-relaxed overflow-x-auto border border-border/30">
            <code>{codeBlocks.join('\n')}</code>
          </pre>
        )
        codeBlocks.length = 0
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeBlocks.push(line)
      continue
    }

    const rendered = renderLine(line, lineIdx++)
    if (rendered) renderedLines.push(rendered)
  }

  return <div className="space-y-0.5">{renderedLines}</div>
})