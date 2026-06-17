export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        r
      </div>
      <span className="font-semibold tracking-tight">
        rootmail <span className="font-normal text-muted-foreground">admin</span>
      </span>
    </div>
  );
}
