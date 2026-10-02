export function Brand({ hero = false }: { hero?: boolean }) {
  return <img className={hero ? "brand-logo brand-hero" : "brand-logo"} src="/brand/soldoku-logo.png" alt="Soldoku" width="2172" height="724" />;
}
