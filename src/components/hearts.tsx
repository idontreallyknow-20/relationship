// Heart visual language: spinner, divider, and the filled heart icon used
// for selected states and reactions.

export function HeartIcon({
  className = "h-5 w-5",
  filled = true,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 21c-.6-.5-9-6.4-9-12A5 5 0 0 1 12 6a5 5 0 0 1 9 3c0 5.6-8.4 11.5-9 12z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
      />
    </svg>
  );
}

export function HeartSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-10" role="status" aria-label={label}>
      <HeartIcon className="heart-pulse h-8 w-8 text-rose-deep" />
    </div>
  );
}

export function HeartDivider() {
  return (
    <div className="my-4 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <HeartIcon className="h-3 w-3 text-blush-deep" />
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
