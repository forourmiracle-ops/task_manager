import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/localStorage'
import type { Comment } from '@/types'

const COMMENTS_KEY = 'comments'
const LOCAL_KEY = 'taskflow_comments'
const useLocal = !isSupabaseConfigured()

function loadLocalComments(): Comment[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalComments(comments: Comment[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(comments))
}

async function fetchComments(taskId: string): Promise<Comment[]> {
  if (useLocal) {
    return loadLocalComments()
      .filter((c) => c.task_id === taskId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }
  try {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data as Comment[]) || []
  } catch (err) {
    console.warn('Supabase comments fetch failed, using local storage:', err)
    return loadLocalComments()
      .filter((c) => c.task_id === taskId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }
}

async function createComment(comment: Pick<Comment, 'task_id' | 'content' | 'author_id'>): Promise<Comment> {
  const now = new Date().toISOString()
  if (useLocal) {
    const comments = loadLocalComments()
    const newComment: Comment = {
      id: crypto.randomUUID(),
      task_id: comment.task_id,
      content: comment.content,
      author_id: comment.author_id,
      created_at: now,
    }
    comments.push(newComment)
    saveLocalComments(comments)
    return newComment
  }
  try {
    const { data, error } = await supabase
      .from('comments')
      .insert({
        task_id: comment.task_id,
        content: comment.content,
        author_id: comment.author_id,
      })
      .select()
      .single()
    if (error) throw error
    return data as Comment
  } catch (err) {
    console.warn('Supabase comment create failed, using local storage:', err)
    const comments = loadLocalComments()
    const newComment: Comment = {
      id: crypto.randomUUID(),
      task_id: comment.task_id,
      content: comment.content,
      author_id: comment.author_id,
      created_at: now,
    }
    comments.push(newComment)
    saveLocalComments(comments)
    return newComment
  }
}

export function useComments(taskId: string) {
  return useQuery({
    queryKey: [COMMENTS_KEY, taskId],
    queryFn: () => fetchComments(taskId),
    staleTime: 30_000,
    enabled: !!taskId,
  })
}

export function useCreateComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createComment,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [COMMENTS_KEY, data.task_id] })
    },
    onError: (err) => {
      console.error('创建评论失败:', err)
    },
  })
}