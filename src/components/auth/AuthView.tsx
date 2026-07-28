import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '@/lib/supabase'

export function AuthView() {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-lg font-bold text-center mb-6">TaskFlow</h1>
        <p className="text-xs text-muted-foreground text-center mb-6 -mt-4">
          登录后，你的任务数据将安全地保存在云端，可在电脑和手机之间同步。
        </p>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={[]}
          localization={{
            variables: {
              sign_in: {
                email_label: '邮箱',
                password_label: '密码',
                button_label: '登录',
              },
              sign_up: {
                email_label: '邮箱',
                password_label: '密码',
                button_label: '注册',
              },
            },
          }}
        />
      </div>
    </div>
  )
}