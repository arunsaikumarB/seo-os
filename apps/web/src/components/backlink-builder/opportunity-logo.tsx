export function OpportunityLogo({
  domain,
  logoUrl,
  size = 32,
}: {
  domain?: string;
  logoUrl?: string;
  size?: number;
}) {
  const src =
    logoUrl ?? (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null);
  if (!src) {
    return (
      <div
        className="rounded-md bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0"
        style={{ width: size, height: size }}
      >
        ?
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="rounded-md shrink-0 bg-muted"
      style={{ width: size, height: size }}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}
