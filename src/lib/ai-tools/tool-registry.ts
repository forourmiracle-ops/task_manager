import type { ToolDefinition } from './types'
import { searchTasksTool } from './search-tasks'
import { createTaskTool } from './create-task'
import { updateTaskTool } from './update-task'
import { deleteTaskTool } from './delete-task'
import { analyzeTasksTool } from './analyze-tasks'
import { generateReportTool } from './generate-report'

const tools: ToolDefinition[] = [
  searchTasksTool,
  createTaskTool,
  updateTaskTool,
  deleteTaskTool,
  analyzeTasksTool,
  generateReportTool,
]

export function getTools(): ToolDefinition[] {
  return tools
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name)
}

export function getToolDefinitionsForAPI(): Array<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}> {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}