import { useAppStore, type ThemeMode, type DefaultDimension, type DensityMode } from '@/store'
import { memo, useState } from 'react'
import { TemplateSettings } from '@/components/templates/TemplateSettings'
import { useUpdateCheck } from '@/components/ui/AppUpdateBanner'

const FONT_SIZE_LABELS = ['极小', '很小', '较小', '标准', '较大', '很大', '特大', '超大']
const FONT_SIZE_SAMPLES = ['12px', '14px', '16px', '18px', '20px', '22px', '24px', '26px']

const DIMENSION_OPTIONS: { value: DefaultDimension; label: string }[] = [
  { value: 'auto', label: '自动（根据任务周期）' },
  { value: 'week', label: '一周' },
  { value: 'month', label: '当月' },
  { value: 'quarter', label: '季度' },
  { value: 'halfyear', label: '半年' },
  { value: 'year', label: '全年' },
]

const THEME_OPTIONS: { value: ThemeMode; label: string; desc: string; icon: string }[] = [
  { value: 'light', label: '浅色模式', desc: '亮色背景，适合日间使用', icon: '☀️' },
  { value: 'dark', label: '夜间模式', desc: '深色背景，减少眩光刺激', icon: '🌙' },
  { value: 'eye-care', label: '护眼模式', desc: '暖色背景，降低蓝光伤害', icon: '👁' },
]

export const SettingsView = memo(function SettingsView() {
  const { theme, setTheme, fontSize, setFontSize, defaultDimension, setDefaultDimension, deepseekApiKey, setDeepseekApiKey, density, setDensity } = useAppStore()
  const [showKey, setShowKey] = useState(false)
  const { checking, result, check, clearResult } = useUpdateCheck()

  return (
    <div className="flex-1 flex justify-center overflow-auto bg-background">
      <div className="w-full max-w-lg p-6 space-y-8">
        <div className="pb-2 border-b border-border">
          <h2 className="text-base font-bold tracking-tight">设置</h2>
          <p className="text-xs text-muted-foreground mt-1">个性化您的 TaskFlow 体验</p>
        </div>

        {/* Theme Selection */}
        <section>
          <h3 className="text-[10px] font-bold mb-3 uppercase text-muted-foreground tracking-wider">主题模式</h3>
          <div className="space-y-2">
            {THEME_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  theme === opt.value
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:bg-accent/50 hover:border-primary/20'
                }`}
              >
                <input
                  type="radio"
                  name="theme"
                  value={opt.value}
                  checked={theme === opt.value}
                  onChange={() => setTheme(opt.value)}
                  className="mt-0.5 accent-primary"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{opt.icon}</span>
                    <span className="text-sm font-semibold">{opt.label}</span>
                    {theme === opt.value && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
                        当前
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Font Size */}
        <section>
          <h3 className="text-[10px] font-bold mb-3 uppercase text-muted-foreground tracking-wider">字体大小</h3>
          <div className="space-y-4 bg-muted/20 rounded-xl p-4 border border-border/50">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">当前档位</span>
              <span className="text-sm font-bold bg-background border border-border px-3 py-1 rounded-lg shadow-sm">
                {fontSize} / 8 — {FONT_SIZE_LABELS[fontSize - 1]} ({FONT_SIZE_SAMPLES[fontSize - 1]})
              </span>
            </div>

            {/* Slider with tick marks */}
            <div className="relative">
              <input
                type="range"
                min={1}
                max={8}
                step={1}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-primary relative z-10"
                style={{
                  background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${((fontSize - 1) / 7) * 100}%, hsl(var(--muted)) ${((fontSize - 1) / 7) * 100}%, hsl(var(--muted)) 100%)`,
                }}
              />
              <div className="absolute top-1/2 left-0 right-0 flex justify-between px-0 pointer-events-none" style={{ transform: 'translateY(-50%)', zIndex: 5 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full transition-all"
                    style={{
                      width: fontSize === i + 1 ? 10 : 6,
                      height: fontSize === i + 1 ? 10 : 6,
                      backgroundColor: fontSize === i + 1 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.4)',
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-between text-[10px] text-muted-foreground">
              {FONT_SIZE_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setFontSize(i + 1)}
                  className={`transition-colors hover:text-foreground ${fontSize === i + 1 ? 'text-primary font-bold' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-3 bg-background rounded-lg border border-border/50 shadow-sm">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">预览效果</p>
              <p className="text-sm leading-relaxed">
                这是一段预览文字，用于展示当前字体大小效果。
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                The quick brown fox jumps over the lazy dog.
              </p>
            </div>
          </div>
        </section>

        {/* Density */}
        <section>
          <h3 className="text-[10px] font-bold mb-3 uppercase text-muted-foreground tracking-wider">显示密度</h3>
          <div className="bg-muted/20 rounded-xl p-4 border border-border/50">
            <p className="text-xs text-muted-foreground mb-3">调整列表行的间距，影响侧边栏和列表视图</p>
            <div className="flex gap-2">
              {([
                { value: 'comfortable' as DensityMode, label: '舒适', desc: '较大行距' },
                { value: 'compact' as DensityMode, label: '紧凑', desc: '较小行距' },
              ]).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex-1 flex items-center gap-2.5 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                    density === opt.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-border hover:bg-accent'
                  }`}
                >
                  <input
                    type="radio"
                    name="density"
                    className="sr-only"
                    checked={density === opt.value}
                    onChange={() => setDensity(opt.value)}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold">{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Default Dimension */}
        <section>
          <h3 className="text-[10px] font-bold mb-3 uppercase text-muted-foreground tracking-wider">默认甘特图维度</h3>
          <div className="bg-muted/20 rounded-xl p-4 border border-border/50">
            <p className="text-xs text-muted-foreground mb-3">设置甘特图打开时的默认时间维度</p>
            <select
              value={defaultDimension}
              onChange={(e) => setDefaultDimension(e.target.value as DefaultDimension)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1.5 focus:ring-ring"
            >
              {DIMENSION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </section>

        {/* DeepSeek API Key */}
        <section>
          <h3 className="text-[10px] font-bold mb-3 uppercase text-muted-foreground tracking-wider">AI 服务配置</h3>
          <div className="bg-muted/20 rounded-xl p-4 border border-border/50 space-y-3">
            <p className="text-xs text-muted-foreground">
              配置 DeepSeek API Key 以启用 AI 助手功能。密钥仅保存在本地浏览器中，不会上传到服务器。
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={deepseekApiKey}
                  onChange={(e) => setDeepseekApiKey(e.target.value)}
                  placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 pr-10 text-sm font-mono border border-border rounded-lg bg-background focus:outline-none focus:ring-1.5 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                  title={showKey ? '隐藏' : '显示'}
                >
                  {showKey ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 8s3-5 6-5 6 5 6 5-3 5-6 5-6-5-6-5z" />
                      <circle cx="8" cy="8" r="2" />
                      <line x1="2" y1="14" x2="14" y2="2" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 8s3-5 6-5 6 5 6 5-3 5-6 5-6-5-6-5z" />
                      <circle cx="8" cy="8" r="2" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className={deepseekApiKey ? 'text-emerald-500' : 'text-amber-500'}>●</span>
              {deepseekApiKey ? '已配置' : '未配置 — 请前往 platform.deepseek.com 获取 API Key'}
            </div>
          </div>
        </section>

        {/* Templates */}
        <section>
          <TemplateSettings />
        </section>

        {/* App Update */}
        <section>
          <h3 className="text-[10px] font-bold mb-3 uppercase text-muted-foreground tracking-wider">软件更新</h3>
          <div className="bg-muted/20 rounded-xl p-4 border border-border/50 space-y-3">
            <p className="text-xs text-muted-foreground">
              检查 GitHub 上是否有新版本可用。启动时自动检查，每两小时一次。
            </p>
            <button
              onClick={check}
              disabled={checking}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
            >
              {checking ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  检查中...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M13.5 8a5.5 5.5 0 01-11 0" />
                    <path d="M2.5 8a5.5 5.5 0 0111 0" />
                    <path d="M8 2v4l2.5 2.5" />
                  </svg>
                  检查更新
                </>
              )}
            </button>
            {result && (
              <div className={`text-xs p-3 rounded-lg ${
                result.hasUpdate
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {result.message}
              </div>
            )}
          </div>
        </section>

        {/* About */}
        <section className="border-t border-border pt-4">
          <h3 className="text-[10px] font-bold mb-2 uppercase text-muted-foreground tracking-wider">关于</h3>
          <div className="text-xs text-muted-foreground space-y-1 bg-muted/20 rounded-xl p-4 border border-border/50">
            <p className="font-semibold text-foreground">TaskFlow</p>
            <p>轻量级工作任务管理系统</p>
            <p>版本 1.0.0</p>
            <p className="text-[10px]">React + TypeScript + Vite + Tailwind CSS</p>
          </div>
        </section>
      </div>
    </div>
  )
})