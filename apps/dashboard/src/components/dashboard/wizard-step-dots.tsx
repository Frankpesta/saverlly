export function WizardStepDots({
  count,
  current,
  steps,
}: {
  count: number
  current: number
  steps?: readonly { title: string; description?: string }[]
}) {
  return (
    <div className="mt-1 flex items-center gap-2 text-xs" aria-label={`Step ${current + 1} of ${count}`}>
      <span className="font-semibold tabular-nums text-[var(--brand-teal-deep)]">{String(current + 1).padStart(2, "0")}</span>
      <span className="text-muted-foreground">of {String(count).padStart(2, "0")}</span>
      {steps?.[current]?.title && <span className="text-muted-foreground">{steps[current].title}</span>}
    </div>
  )
}
