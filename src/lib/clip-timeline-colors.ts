/** Distinct hues for adjacent segments on the same source clip (golden-angle step). */
export function clipPeerSegmentColor(peerIndex: number): string {
  const h = (peerIndex * 137.508) % 360;
  return `hsl(${h} 56% 46%)`;
}
