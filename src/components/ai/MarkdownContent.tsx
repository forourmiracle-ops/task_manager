import { memo } from 'react'

/**
 * Lightweight Markdown renderer.
 * Supports: **bold**, *italic*, `code`, ```code blocks```, lists, headings, tables, blockquotes, hr, line breaks
 */

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let idx = 0

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*/)
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={idx++}>{boldMatch[1]}</span>)
      parts.push(<strong key={idx++} className="font-bold">{boldMatch[2]}</strong>)
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*/)
    if (italicMatch) {
      if (italicMatch[1]) parts.push(<span key={idx++}>{italicMatch[1]}</span>)
      parts.push(<em key={idx++}>{italicMatch[2]}</em>)
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }

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

    parts.push(<span key={idx++}>{remaining}</span>)
    break
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}

function renderTableRow(line: string, key: number, isHeader: boolean): React.ReactNode {
  const cells = line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

  const CellTag = isHeader ? 'th' : 'td'
  const cellClass = isHeader
    ? 'px-2 py-1.5 text-[10px] font-semibold text-muted-foreground text-left border-b border-border/50'
    : 'px-2 py-1.5 text-[11px] border-b border-border/20'

  return (
    <tr key={key}>
      {cells.map((cell, i) => (
        <CellTag key={i} className={cellClass}>
          {renderInline(cell)}
        </CellTag>
      ))}
    </tr>
  )
}

function isSeparatorRow(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.trim())
}

export const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  if (!content) return null

  const lines = content.split('\n')
  const renderedLines: React.ReactNode[] = []
  let inCodeBlock = false
  let inTable = false
  let tableLines: string[] = []
  let lineIdx = 0

  function flushTable() {
    if (tableLines.length === 0) return
    // Filter out separator rows
    const rows = tableLines.filter((l) => !isSeparatorRow(l))
    if (rows.length === 0) {
      tableLines = []
      return
    }
    renderedLines.push(
      <div key={`table-${lineIdx++}`} className="my-2 overflow-x-auto rounded-lg border border-border/30">
        <table className="w-full border-collapse">
          <thead>{renderTableRow(rows[0], lineIdx++, true)}</thead>
          <tbody>
            {rows.slice(1).map((row, _i) => renderTableRow(row, lineIdx++, false))}
          </tbody>
        </table>
      </div>
    )
    tableLines = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code block
    if (line.trim().startsWith('```')) {
      if (inTable) flushTable()

      if (inCodeBlock) {
        inCodeBlock = false
        continue
      } else {
        inCodeBlock = true
        // Collect code block content
        let codeContent = ''
        let j = i + 1
        while (j < lines.length && !lines[j].trim().startsWith('```')) {
          codeContent += (codeContent ? '\n' : '') + lines[j]
          j++
        }
        i = j // skip to closing ```
        renderedLines.push(
          <pre key={`code-${lineIdx++}`} className="bg-muted/30 rounded-lg p-3 my-2 text-[11px] font-mono leading-relaxed overflow-x-auto border border-border/30">
            <code>{codeContent}</code>
          </pre>
        )
        continue
      }
    }

    if (inCodeBlock) continue

    // Table detection
    if (line.trim().startsWith('|') && line.trim().endsWith('|') && !isSeparatorRow(line)) {
      if (!inTable) {
        // Check if next line is a separator row
        const nextLine = lines[i + 1]
        if (nextLine && isSeparatorRow(nextLine.trim())) {
          inTable = true
          tableLines = [line]
          continue
        }
      }
    }

    if (inTable) {
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        tableLines.push(line)
        continue
      } else {
        flushTable()
        inTable = false
      }
    }

    // Blockquote
    if (line.trim().startsWith('> ')) {
      const text = line.trim().replace(/^>\s?/, '')
      renderedLines.push(
        <div key={`bq-${lineIdx++}`} className="border-l-2 border-primary/30 pl-3 py-1 my-1 text-xs text-muted-foreground italic">
          {renderInline(text)}
        </div>
      )
      continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      renderedLines.push(<hr key={`hr-${lineIdx++}`} className="my-2 border-border/30" />)
      continue
    }

    // Heading
    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^(#{1,3})/)![1].length
      const text = line.replace(/^#{1,3}\s/, '')
      const sizes = ['text-sm', 'text-xs', 'text-xs']
      const weights = ['font-bold', 'font-semibold', 'font-medium']
      renderedLines.push(
        <div key={`h-${lineIdx++}`} className={`${sizes[level - 1]} ${weights[level - 1]} mt-1.5 first:mt-0`}>
          {renderInline(text)}
        </div>
      )
      continue
    }

    // Unordered list
    if (/^[-*]\s/.test(line)) {
      const text = line.replace(/^[-*]\s/, '')
      renderedLines.push(
        <div key={`li-${lineIdx++}`} className="flex items-start gap-2 text-xs ml-1">
          <span className="text-muted-foreground mt-0.5 flex-shrink-0">•</span>
          <span>{renderInline(text)}</span>
        </div>
      )
      continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)/)
      if (match) {
        renderedLines.push(
          <div key={`ol-${lineIdx++}`} className="flex items-start gap-2 text-xs ml-1">
            <span className="text-muted-foreground mt-0.5 flex-shrink-0 min-w-[1.2em]">{match[1]}.</span>
            <span>{renderInline(match[2])}</span>
          </div>
        )
        continue
      }
    }

    // Empty line
    if (!line.trim()) {
      renderedLines.push(<div key={`sp-${lineIdx++}`} className="h-2" />)
      continue
    }

    // Regular text
    renderedLines.push(<div key={`t-${lineIdx++}`} className="text-xs leading-relaxed">{renderInline(line)}</div>)
  }

  // Flush any remaining table
  if (inTable) flushTable()

  return <div className="space-y-0.5">{renderedLines}</div>
})