# Camera Movement Taxonomy

## Finding

A comprehensive, canonical camera movement taxonomy drawn from established cinematography literature including the ASC Manual (10th ed.), Blain Brown's "Cinematography: Theory and Practice" (3rd ed.), Steven D. Katz's "Film Directing Shot by Shot," and StudioBinder glossaries.

## 1. Camera Movement Types (21 values)

| Slug | Display Name | Definition |
|---|---|---|
| `static` | Static / Locked Off | Camera is mounted and stationary; no movement. |
| `pan` | Pan | Camera rotates horizontally around its vertical axis (left or right) while fixed in place. |
| `tilt` | Tilt | Camera rotates vertically around its horizontal axis (up or down) while fixed in place. |
| `roll` | Roll / Dutch Roll | Camera rotates around its lens axis (z-axis), producing a canted frame. |
| `dolly` | Dolly | Camera physically moves forward or backward along a track. Also "push in / pull out." |
| `truck` | Truck / Crab | Camera physically moves laterally (left or right) while keeping facing direction constant. |
| `pedestal` | Pedestal | Camera physically moves vertically on its mount while remaining level. Distinct from tilt. |
| `crane` | Crane / Jib | Camera moves through 3D space via crane or jib arm. |
| `boom` | Boom | Vertical crane arm movement; sometimes synonymous with crane up/down. |
| `zoom` | Zoom | Change in focal length via lens; camera does not physically move. |
| `dolly_zoom` | Dolly Zoom (Vertigo Effect) | Simultaneous dolly + opposing zoom. Also "Hitchcock zoom." |
| `handheld` | Handheld | Camera carried by operator without stabilizer; organic shake. |
| `steadicam` | Steadicam / Gimbal | Mechanical or electronic stabilizer; fluid movement. |
| `drone` | Drone / Aerial | Camera on unmanned aerial vehicle. |
| `aerial` | Aerial (Helicopter) | Camera on crewed aircraft; distinguished from drone by scale. |
| `arc` | Arc | Camera travels in a curved path around a subject. |
| `whip_pan` | Whip Pan / Swish Pan | Extremely fast pan causing motion blur; often used as transition. |
| `whip_tilt` | Whip Tilt | Extremely fast tilt. |
| `rack_focus` | Rack Focus | Shift in focal plane from one subject to another within frame. |
| `follow` | Follow | Camera moves to keep pace with moving subject; may use any mechanism. |
| `reveal` | Reveal | Movement that progressively discloses new visual information. |
| `reframe` | Reframe | Small adjustment to re-center a subject; micro-pan/tilt/truck. |

**Edge Cases:** "Tracking shot" is ambiguous — prefer mechanical type (`truck`, `dolly`, `follow`). "Crane" vs "jib" vs "boom" — collapse to `crane` unless precision needed. Gimbal is functionally equivalent to Steadicam for classification.

## 2. Direction (15 values)

| Slug | Definition |
|---|---|
| `left` | Pan rotates left; truck moves left |
| `right` | Pan rotates right; truck moves right |
| `up` | Tilt up; pedestal rises; crane ascends |
| `down` | Tilt down; pedestal descends; crane descends |
| `in` | Dolly/zoom toward subject; frame tightens |
| `out` | Dolly/zoom away from subject; frame widens |
| `clockwise` | Arc or roll clockwise (from camera's POV) |
| `counter_clockwise` | Arc or roll counter-clockwise |
| `forward` | Movement in direction camera faces |
| `backward` | Movement opposite to camera facing |
| `lateral_left` | Truck moves camera body left |
| `lateral_right` | Truck moves camera body right |
| `diagonal` | Movement at oblique angle |
| `circular` | Full or near-full orbit around subject |
| `none` | No directional movement (static) |

## 3. Speed / Pacing (7 values)

| Slug | Definition | Anchor |
|---|---|---|
| `freeze` | No movement | Static only |
| `imperceptible` | Not consciously registered by viewer | < 0.1 m/s dolly equiv. |
| `slow` | Gentle and deliberate | 0.1–0.5 m/s |
| `moderate` | Neutral, matches scene energy | 0.5–1.5 m/s |
| `fast` | Energetic, adds urgency | 1.5–5 m/s |
| `very_fast` | Aggressive, disorienting | High-action |
| `snap` | Near-instantaneous (1-3 frames) | Whip pan/tilt/zoom |

## 4. Compound Movements

Notation: ordered list of `{type}:{direction}` pairs.

| Name | Components | Definition |
|---|---|---|
| Dolly Zoom | `dolly:in + zoom:out` (or reverse) | Hold subject size, warp background |
| Crane-Pan | `crane:up + pan:left/right` | Sweeping establishing/departure |
| Pedestal-Tilt | `pedestal:up + tilt:up` | Rise while tilting |
| Follow-Pan | `truck:left/right + pan:left/right` | Lateral track + pan to keep subject |
| Arc-Tilt | `arc:cw/ccw + tilt:up/down` | Orbit with vertical reframe |

Rules: Max 3 practical simultaneous components. >3 = tag as `steadicam` or `drone` with `freeform` direction.

## 5. Shot Sizes (15 values)

| Slug | Abbrev | Definition |
|---|---|---|
| `extreme_wide` | EWS | Subject tiny in vast environment |
| `wide` | WS/LS | Full figure with significant environment |
| `full` | FS | Head to feet, minimal environment |
| `medium_wide` | MWS/CS | Mid-thigh to head ("cowboy shot") |
| `medium` | MS | Waist to head |
| `medium_close` | MCU | Chest to head, includes shoulders |
| `close` | CU | Face fills frame |
| `extreme_close` | ECU | Portion of face or detail |
| `insert` | — | ECU of specific object for editorial emphasis |
| `two_shot` | 2S | Two subjects in frame |
| `three_shot` | 3S | Three subjects in frame |
| `group` | GS | Four or more subjects |
| `ots` | OTS | Over-the-shoulder |
| `pov` | POV | Character's literal viewpoint |
| `reaction` | RXN | Subject responding to event |

## 6. Camera Angles

### Vertical (6 values)
| Slug | Definition |
|---|---|
| `eye_level` | Camera at subject's eye height; neutral |
| `high_angle` | Above eye line, angled down |
| `low_angle` | Below eye line, angled up |
| `birds_eye` | Directly overhead, straight down |
| `worms_eye` | Ground level, steeply upward |
| `overhead` | Significantly above, not necessarily straight down |

### Horizontal (5 values)
| Slug | Definition |
|---|---|
| `frontal` | Camera faces subject squarely |
| `profile` | 90 degrees to subject |
| `three_quarter` | ~45 degrees; standard "Hollywood" angle |
| `rear` | Camera faces back of subject |
| `ots` | Behind and to side of one subject |

### Special (4 values)
| Slug | Definition |
|---|---|
| `dutch` | Rolled on lens axis; diagonal horizon |
| `pov` | Character's literal viewpoint |
| `shoulder_mounted` | Documentary/news-camera aesthetic |
| `slanted` | Subtle Dutch angle; stylized |

## 7. Shot Duration Categories (6 values)

| Slug | Duration | Definition |
|---|---|---|
| `flash` | < 0.5s | Subliminal cut; shock/montage |
| `brief` | 0.5–2s | Short, punchy; action editing |
| `standard` | 2–7s | Classical Hollywood ASL (Bordwell) |
| `extended` | 7–20s | Dialogue/observational |
| `long_take` | 20–120s | Purposeful duration; Tarkovsky, Kubrick |
| `oner` | > 2min | Full scene/sequence in one shot |

## Sources

- ASC Manual, 10th Edition (2013)
- Brown, "Cinematography: Theory and Practice," 3rd Ed. (2016)
- Katz, "Film Directing Shot by Shot" (1991)
- Murch, "In the Blink of an Eye," 2nd Ed. (2001)
- Bordwell & Thompson, "Film Art: An Introduction," 12th Ed. (2019)
- StudioBinder camera movement and shot type glossaries
- Mascelli, "The Five C's of Cinematography" (1965)

## Confidence

**0.85** — Training-knowledge-based. Core taxonomy is extremely well-established across all cited references.
