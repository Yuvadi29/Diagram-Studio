/**
 * The ChaiUI page background: a warm hexagon glow centred at the top, behind
 * everything, with the bottom faded out.
 * Put it once inside an element with the `ds-backdrop-host` class.
 */
export function Backdrop() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="ds-backdrop" src="/backdrop.svg" alt="" aria-hidden fetchPriority="high" decoding="async" />;
}
