/** Staff console. Same mark as the customer product (see the marketing app for
 *  why it is filled, and what was rejected), plus the "admin" suffix — staff
 *  should never be a glance away from knowing which console they are in. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M6.3 4.5H17.7A2.8 2.8 0 0 1 20.5 7.3V16.7A2.8 2.8 0 0 1 17.7 19.5H6.3A2.8 2.8 0 0 1 3.5 16.7V7.3A2.8 2.8 0 0 1 6.3 4.5ZM4.9 6 12 11.9 19.1 6 19.1 4.5 4.9 4.5Z" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <LogoMark className="size-[17px]" />
      </div>
      <span className="font-semibold tracking-tight">
        rootmail <span className="font-normal text-muted-foreground">admin</span>
      </span>
    </div>
  );
}
