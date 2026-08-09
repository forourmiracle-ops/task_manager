import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/localStorage'
import type { Comment } from '@/types'

const COMMENTS_KEY = 'comments'
const useLocal = !isSupabaseConfigured()

function localCommentsKey(userId: string): string {
  return `taskflow_${userId}_comments`
}

function loadLocalComments(userId: string): Comment[] {
  try {
    const raw = localStorage.getItem(localCommentsKey(userId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalComments(userId: string, comments: Comment[]): void {
  localStorage.setItem(localCommentsKey(userId), JSON.stringify(comments))
}

async function fetchComments(taskId: string, userId: string): Promise<Comment[]> {
  if (useLocal) {
    return loadLocalComments(userId)
      .filter((c) => c.task_id === taskId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data as Comment[]) || []
  } catch (err) {
    console.warn('Supabase comments fetch failed, using local storage:', err)
    return loadLocalComments(userId)
      .filter((c) => c.task_id === taskId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }
}

async function createComment(comment: Pick<Comment, 'task_id' | 'content' | 'author_id'>, userId: string): Promise<Comment> {
  const now = new Date().toISOString()
  if (useLocal) {
    const comments = loadLocalComments(userId)
    const newComment: Comment = {
      id: crypto.randomUUID(),
      task_id: comment.task_id,
      content: comment.content,
      author_id: comment.author_id,
      created_at: now,
    }
    comments.push(newComment)
    saveLocalComments(userId, comments)
    return newComment
  }
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('comments')
      .insert({
        task_id: comment.task_id,
        content: comment.content,
        author_id: comment.author_id,
        user_id: user!.id,
      })
      .select()
      .single()
    if (error) throw error
    return data as Comment
  } catch (err) {
    console.warn('Supabase comment create failed, using local storage:', err)
    const comments = loadLocalComments(userId)
    const newComment: Comment = {
      id: crypto.randomUUID(),
      task_id: comment.task_id,
      content: comment.content,
      author_id: comment.author_id,
      created_at: now,
    }
    comments.push(newComment)
    saveLocalComments(userId, comments)
    return newComment
  }
}

export function useComments(taskId: string, userId: string) {
  return useQuery({
    queryKey: [COMMENTS_KEY, taskId, userId],
    queryFn: () => fetchComments(taskId, userId),
    staleTime: 30_000,
    enabled: !!taskId && !!userId,
  })
}

export function useCreateComment(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (comment: Pick<Comment, 'task_id' | 'content' | 'author_id'>) => createComment(comment, userId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [COMMENTS_KEY, data.task_id] })
    },
    onError: (err) => {
      console.error('创建评论失败:', err)
    },
  })
}