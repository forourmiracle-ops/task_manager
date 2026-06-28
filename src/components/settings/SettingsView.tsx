import { useAppStore, type ThemeMode } from '@/store'

const FONT_SIZE_LABELS = ['极小', '很小', '较小', '标准', '较大', '很大', '特大', '超大']
const FONT_SIZE_SAMPLES = ['12px', '14px', '16px', '18px', '20px', '22px', '24px', '26px']

const THEME_OPTIONS: { value: ThemeMode; label: string; desc: string; icon: string }[] = [
  { value: 'light', label: '浅色模式', desc: '亮色背景，适合日间使用', icon: '☀️' },
  { value: 'dark', label: '夜间模式', desc: '深色背景，减少眩光刺激', icon: '🌙' },
  { value: 'eye-care', label: '护眼模式', desc: '暖色背景，降低蓝光伤害', icon: '👁' },
]

export function SettingsView() {
  const { theme, setTheme, fontSize, setFontSize } = useAppStore()

  return (
    <div className="flex-1 flex justify-center overflow-auto bg-background">
      <div className="w-full max-w-lg p-6 space-y-8">
        <div>
          <h2 className="text-sm font-semibold mb-1">设置</h2>
          <p className="text-xs text-muted-foreground">个性化您的 TaskFlow 体验</p>
        </div>

        {/* Theme Selection */}
        <section>
          <h3 className="text-xs font-medium mb-3 uppercase text-muted-foreground tracking-wide">主题模式</h3>
          <div className="space-y-2">
            {THEME_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  theme === opt.value
                    ? 'border-primary bg-accent'
                    : 'border-border hover:bg-accent/50'
                }`}
              >
                <input
                  type="radio"
                  name="theme"
                  value={opt.value}
                  checked={theme === opt.value}
                  onChange={() => setTheme(opt.value)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{opt.icon}</span>
                    <span className="text-sm font-medium">{opt.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Font Size */}
        <section>
          <h3 className="text-xs font-medium mb-3 uppercase text-muted-foreground tracking-wide">字体大小</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">当前档位</span>
              <span className="text-sm font-semibold bg-accent px-2 py-0.5 rounded">
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
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary relative z-10"
                style={{
                  background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${((fontSize - 1) / 7) * 100}%, hsl(var(--muted)) ${((fontSize - 1) / 7) * 100}%, hsl(var(--muted)) 100%)`,
                }}
              />
              {/* Tick marks */}
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

            {/* Labels under slider */}
            <div className="flex justify-between text-[10px] text-muted-foreground">
              {FONT_SIZE_LABELS.map((label, i) => (
                <span
                  key={i}
                  className={`cursor-pointer transition-colors ${fontSize === i + 1 ? 'text-primary font-semibold' : 'hover:text-foreground'}`}
                  onClick={() => setFontSize(i + 1)}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Preview */}
            <div className="p-3 bg-muted/50 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground mb-2">预览效果</p>
              <p className="text-sm leading-relaxed">
                这是一段预览文字，用于展示当前字体大小效果。您可以拖动滑块来调整字体大小，找到最适合您的阅读体验。
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                The quick brown fox jumps over the lazy dog.
              </p>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="border-t border-border pt-4">
          <h3 className="text-xs font-medium mb-2 uppercase text-muted-foreground tracking-wide">关于</h3>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>TaskFlow — 轻量级工作任务管理系统</p>
            <p>版本 1.0.0</p>
            <p>技术栈：React + TypeScript + Vite + Tailwind CSS</p>
          </div>
        </section>
      </div>
    </div>
  )
}