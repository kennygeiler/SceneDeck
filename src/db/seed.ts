import { db, schema } from "./index";
import {
  searchTmdbMovieId,
  fetchTmdbMovieDetails,
} from "@/lib/tmdb";
import type {
  MovementTypeSlug,
  DirectionSlug,
  SpeedSlug,
  ShotSizeSlug,
  VerticalAngleSlug,
  HorizontalAngleSlug,
  DurationCategorySlug,
} from "@/lib/taxonomy";

// ---------------------------------------------------------------------------
// Film definitions
// ---------------------------------------------------------------------------

const FILMS = [
  {
    title: "2001: A Space Odyssey",
    director: "Stanley Kubrick",
    year: 1968,
  },
  {
    title: "Whiplash",
    director: "Damien Chazelle",
    year: 2014,
  },
  {
    title: "Blade Runner 2049",
    director: "Denis Villeneuve",
    year: 2017,
  },
] as const;

// ---------------------------------------------------------------------------
// Scene definitions (per film)
// ---------------------------------------------------------------------------

type SceneDef = {
  filmTitle: string;
  sceneNumber: number;
  title: string;
  description: string;
  location: string;
  interiorExterior: string;
  timeOfDay: string;
};

const SCENES: SceneDef[] = [
  // 2001: A Space Odyssey
  {
    filmTitle: "2001: A Space Odyssey",
    sceneNumber: 1,
    title: "The Dawn of Man",
    description:
      "Prehistoric apes encounter a mysterious black monolith on the African plains, sparking the first use of tools.",
    location: "African savanna",
    interiorExterior: "exterior",
    timeOfDay: "dawn",
  },
  {
    filmTitle: "2001: A Space Odyssey",
    sceneNumber: 2,
    title: "Discovery One",
    description:
      "Astronauts Dave Bowman and Frank Poole navigate the ship while HAL 9000 monitors every move.",
    location: "Discovery One spacecraft",
    interiorExterior: "interior",
    timeOfDay: "n/a",
  },
  {
    filmTitle: "2001: A Space Odyssey",
    sceneNumber: 3,
    title: "Beyond the Infinite",
    description:
      "Dave enters the Star Gate — a psychedelic corridor of light and color bending perception itself.",
    location: "Star Gate / alien room",
    interiorExterior: "interior",
    timeOfDay: "n/a",
  },

  // Whiplash
  {
    filmTitle: "Whiplash",
    sceneNumber: 1,
    title: "Practice Room",
    description:
      "Andrew Neiman practices alone, bleeding onto his drum kit, obsessed with perfection.",
    location: "Shaffer Conservatory practice room",
    interiorExterior: "interior",
    timeOfDay: "night",
  },
  {
    filmTitle: "Whiplash",
    sceneNumber: 2,
    title: "Jazz Competition",
    description:
      "The studio band competes under Fletcher's tyrannical direction at a regional jazz competition.",
    location: "Competition auditorium",
    interiorExterior: "interior",
    timeOfDay: "evening",
  },
  {
    filmTitle: "Whiplash",
    sceneNumber: 3,
    title: "Final Performance",
    description:
      "Andrew takes control at JVC, turning Fletcher's sabotage into a transcendent drum solo.",
    location: "JVC concert hall stage",
    interiorExterior: "interior",
    timeOfDay: "evening",
  },

  // Blade Runner 2049
  {
    filmTitle: "Blade Runner 2049",
    sceneNumber: 1,
    title: "Protein Farm",
    description:
      "Officer K arrives at Sapper Morton's remote protein farm on the outskirts of Los Angeles.",
    location: "Sapper Morton's protein farm",
    interiorExterior: "exterior",
    timeOfDay: "overcast day",
  },
  {
    filmTitle: "Blade Runner 2049",
    sceneNumber: 2,
    title: "Wallace Corporation",
    description:
      "Niander Wallace examines a newly born replicant in his cathedral-like headquarters.",
    location: "Wallace Corporation HQ",
    interiorExterior: "interior",
    timeOfDay: "dim artificial",
  },
  {
    filmTitle: "Blade Runner 2049",
    sceneNumber: 3,
    title: "Las Vegas Ruins",
    description:
      "K discovers Deckard living alone among the irradiated orange ruins of Las Vegas.",
    location: "Abandoned Las Vegas casino",
    interiorExterior: "interior",
    timeOfDay: "orange haze",
  },
];

// ---------------------------------------------------------------------------
// Shot definitions (per scene)
// ---------------------------------------------------------------------------

type ShotDef = {
  sceneTitle: string;
  startTc: number;
  endTc: number;
  duration: number;
  movementType: MovementTypeSlug;
  direction: DirectionSlug;
  speed: SpeedSlug;
  shotSize: ShotSizeSlug;
  angleVertical: VerticalAngleSlug;
  angleHorizontal: HorizontalAngleSlug;
  durationCat: DurationCategorySlug;
  isCompound: boolean;
  compoundParts?: Array<{ type: MovementTypeSlug; direction: DirectionSlug }>;
  description: string;
  subjects: string[];
  mood: string;
  lighting: string;
  techniqueNotes: string;
};

const SHOTS: ShotDef[] = [
  // --- 2001: Scene 1 — The Dawn of Man ---
  {
    sceneTitle: "The Dawn of Man",
    startTc: 0,
    endTc: 18.5,
    duration: 18.5,
    movementType: "static",
    direction: "none",
    speed: "freeze",
    shotSize: "extreme_wide",
    angleVertical: "eye_level",
    angleHorizontal: "frontal",
    durationCat: "extended",
    isCompound: false,
    description:
      "Vast African savanna at dawn. Silhouettes of prehistoric apes against the rising sun.",
    subjects: ["apes", "savanna", "sunrise"],
    mood: "primordial, austere",
    lighting: "natural backlit dawn, silhouette",
    techniqueNotes:
      "Front-lit projection with 65mm; static camera emphasizes the landscape's scale.",
  },
  {
    sceneTitle: "The Dawn of Man",
    startTc: 18.5,
    endTc: 32.0,
    duration: 13.5,
    movementType: "pan",
    direction: "right",
    speed: "slow",
    shotSize: "wide",
    angleVertical: "low_angle",
    angleHorizontal: "three_quarter",
    durationCat: "extended",
    isCompound: false,
    description:
      "Slow pan reveals the monolith standing among the apes, who approach with cautious reverence.",
    subjects: ["monolith", "apes"],
    mood: "mysterious, reverent",
    lighting: "harsh directional sunlight, deep shadows",
    techniqueNotes:
      "Pan motivated by apes' movement toward the monolith. Low angle gives the monolith towering authority.",
  },
  {
    sceneTitle: "The Dawn of Man",
    startTc: 32.0,
    endTc: 39.0,
    duration: 7.0,
    movementType: "tilt",
    direction: "up",
    speed: "slow",
    shotSize: "medium",
    angleVertical: "worms_eye",
    angleHorizontal: "frontal",
    durationCat: "standard",
    isCompound: false,
    description:
      "Camera tilts up the monolith from base to apex, the sun cresting over its edge.",
    subjects: ["monolith", "sun"],
    mood: "awe, transcendence",
    lighting: "direct sun creating lens flare at apex",
    techniqueNotes:
      "Worm's eye tilt reinforces the monolith's alien scale. Alignment with sun is precisely timed.",
  },
  {
    sceneTitle: "The Dawn of Man",
    startTc: 39.0,
    endTc: 44.5,
    duration: 5.5,
    movementType: "static",
    direction: "none",
    speed: "freeze",
    shotSize: "close",
    angleVertical: "eye_level",
    angleHorizontal: "frontal",
    durationCat: "standard",
    isCompound: false,
    description:
      "Close-up of an ape's hand reaching toward the monolith's perfectly smooth surface.",
    subjects: ["ape hand", "monolith surface"],
    mood: "tentative, curious",
    lighting: "reflected light from monolith surface",
    techniqueNotes: "Static close-up isolates the moment of first contact. No camera movement — the hand does the moving.",
  },

  // --- 2001: Scene 2 — Discovery One ---
  {
    sceneTitle: "Discovery One",
    startTc: 0,
    endTc: 42.0,
    duration: 42.0,
    movementType: "steadicam",
    direction: "forward",
    speed: "slow",
    shotSize: "medium",
    angleVertical: "eye_level",
    angleHorizontal: "frontal",
    durationCat: "long_take",
    isCompound: false,
    description:
      "Dave jogs the centrifuge ring. Camera follows steadily as the corridor curves upward around him.",
    subjects: ["Dave Bowman", "centrifuge corridor"],
    mood: "isolation, routine",
    lighting: "clinical white fluorescent, even exposure",
    techniqueNotes:
      "The rotating set creates the illusion of zero gravity. Steadicam maintains level horizon while the set rotates around the actor.",
  },
  {
    sceneTitle: "Discovery One",
    startTc: 42.0,
    endTc: 54.0,
    duration: 12.0,
    movementType: "dolly",
    direction: "in",
    speed: "slow",
    shotSize: "medium_close",
    angleVertical: "eye_level",
    angleHorizontal: "frontal",
    durationCat: "extended",
    isCompound: false,
    description:
      "Slow dolly in on HAL's red eye as Dave asks about the mission's true purpose.",
    subjects: ["HAL 9000 eye"],
    mood: "tension, menace",
    lighting: "red glow from HAL's lens, dark surround",
    techniqueNotes:
      "The dolly toward HAL's eye is one of cinema's most iconic approach shots. The red lens fills the frame asymptotically.",
  },
  {
    sceneTitle: "Discovery One",
    startTc: 54.0,
    endTc: 62.5,
    duration: 8.5,
    movementType: "static",
    direction: "none",
    speed: "freeze",
    shotSize: "two_shot",
    angleVertical: "eye_level",
    angleHorizontal: "profile",
    durationCat: "standard",
    isCompound: false,
    description:
      "Dave and Frank speak in the EVA pod, believing HAL cannot hear. Shot through the pod window.",
    subjects: ["Dave Bowman", "Frank Poole"],
    mood: "conspiratorial, claustrophobic",
    lighting: "instrument panel glow, harsh overhead",
    techniqueNotes:
      "Profile two-shot through the pod window. HAL's lip-reading is implied by the visual barrier.",
  },
  {
    sceneTitle: "Discovery One",
    startTc: 62.5,
    endTc: 75.0,
    duration: 12.5,
    movementType: "pan",
    direction: "left",
    speed: "imperceptible",
    shotSize: "wide",
    angleVertical: "high_angle",
    angleHorizontal: "three_quarter",
    durationCat: "extended",
    isCompound: false,
    description:
      "High-angle wide of the centrifuge interior. The subtle pan follows Dave walking the curved floor.",
    subjects: ["Dave Bowman", "centrifuge interior"],
    mood: "mechanical, vast",
    lighting: "diffuse white, no shadows",
    techniqueNotes:
      "Near-imperceptible pan matches Dave's glacial pace. The high angle flattens the curved space.",
  },

  // --- 2001: Scene 3 — Beyond the Infinite ---
  {
    sceneTitle: "Beyond the Infinite",
    startTc: 0,
    endTc: 65.0,
    duration: 65.0,
    movementType: "zoom",
    direction: "in",
    speed: "slow",
    shotSize: "extreme_wide",
    angleVertical: "eye_level",
    angleHorizontal: "frontal",
    durationCat: "oner",
    isCompound: false,
    description:
      "The Star Gate sequence: streaks of light elongate as the camera appears to accelerate through an infinite corridor.",
    subjects: ["light corridor", "star gate"],
    mood: "transcendent, overwhelming",
    lighting: "slit-scan photography, pure colored light",
    techniqueNotes:
      "Douglas Trumbull's slit-scan photography. A single oner that reshapes the viewer's sense of time.",
  },
  {
    sceneTitle: "Beyond the Infinite",
    startTc: 65.0,
    endTc: 80.0,
    duration: 15.0,
    movementType: "dolly_zoom",
    direction: "in",
    speed: "imperceptible",
    shotSize: "medium",
    angleVertical: "eye_level",
    angleHorizontal: "frontal",
    durationCat: "extended",
    isCompound: false,
    description:
      "Dave's face inside the helmet distorts as space compresses around him. The background stretches while he stays fixed.",
    subjects: ["Dave Bowman", "helmet visor"],
    mood: "disorientation, awe",
    lighting: "colored light reflections on visor, shifting spectrum",
    techniqueNotes:
      "Dolly zoom (Vertigo effect) creates the sense that space itself is warping around the astronaut.",
  },
  {
    sceneTitle: "Beyond the Infinite",
    startTc: 80.0,
    endTc: 110.0,
    duration: 30.0,
    movementType: "crane",
    direction: "up",
    speed: "slow",
    shotSize: "wide",
    angleVertical: "birds_eye",
    angleHorizontal: "frontal",
    durationCat: "long_take",
    isCompound: false,
    description:
      "The white room. Camera cranes up to reveal Dave at the table, now aged, eating dinner alone in an ornate neoclassical chamber.",
    subjects: ["aged Dave Bowman", "neoclassical room"],
    mood: "surreal, lonely",
    lighting: "floor-lit white room, no visible source",
    techniqueNotes:
      "The crane-up reveal uses the room's sourceless light to create a liminal, out-of-time atmosphere.",
  },
  {
    sceneTitle: "Beyond the Infinite",
    startTc: 110.0,
    endTc: 125.0,
    duration: 15.0,
    movementType: "dolly",
    direction: "in",
    speed: "imperceptible",
    shotSize: "medium_close",
    angleVertical: "high_angle",
    angleHorizontal: "frontal",
    durationCat: "extended",
    isCompound: false,
    description:
      "Imperceptible dolly toward the bed where the ancient Dave lies. The monolith stands at the foot.",
    subjects: ["dying Dave", "monolith", "bed"],
    mood: "transcendent, solemn",
    lighting: "white glow, ethereal",
    techniqueNotes:
      "The glacial dolly echoes the earlier approach to HAL's eye, bookending the film's visual language.",
  },

  // --- Whiplash: Scene 1 — Practice Room ---
  {
    sceneTitle: "Practice Room",
    startTc: 0,
    endTc: 1.2,
    duration: 1.2,
    movementType: "whip_pan",
    direction: "right",
    speed: "snap",
    shotSize: "extreme_close",
    angleVertical: "eye_level",
    angleHorizontal: "frontal",
    durationCat: "flash",
    isCompound: false,
    description:
      "Snap whip pan from Andrew's face to his hand striking the snare — pure velocity.",
    subjects: ["Andrew Neiman", "snare drum"],
    mood: "frenetic, obsessive",
    lighting: "warm tungsten overhead, isolated pool",
    techniqueNotes:
      "The whip pan is Chazelle's signature: it transfers the energy of the drumstick into camera motion.",
  },
  {
    sceneTitle: "Practice Room",
    startTc: 1.2,
    endTc: 4.8,
    duration: 3.6,
    movementType: "dolly",
    direction: "in",
    speed: "fast",
    shotSize: "close",
    angleVertical: "eye_level",
    angleHorizontal: "three_quarter",
    durationCat: "brief",
    isCompound: false,
    description:
      "Fast dolly into Andrew's bleeding hand gripping the drumstick, fingers split and raw.",
    subjects: ["Andrew's hand", "drumstick", "blood"],
    mood: "pain, determination",
    lighting: "warm overhead, spotlight on hands",
    techniqueNotes:
      "The fast dolly compresses time — we're suddenly in the wound. No cut needed.",
  },
  {
    sceneTitle: "Practice Room",
    startTc: 4.8,
    endTc: 7.5,
    duration: 2.7,
    movementType: "static",
    direction: "none",
    speed: "freeze",
    shotSize: "medium",
    angleVertical: "eye_level",
    angleHorizontal: "frontal",
    durationCat: "brief",
    isCompound: false,
    description:
      "Andrew alone at the kit, sweat dripping, the empty practice room stretching behind him.",
    subjects: ["Andrew Neiman", "drum kit"],
    mood: "isolated, exhausted",
    lighting: "single overhead spot, darkness beyond",
    techniqueNotes:
      "The static frame after rapid movement creates a moment of held breath.",
  },

  // --- Whiplash: Scene 2 — Jazz Competition ---
  {
    sceneTitle: "Jazz Competition",
    startTc: 0,
    endTc: 8.0,
    duration: 8.0,
    movementType: "follow",
    direction: "forward",
    speed: "moderate",
    shotSize: "medium",
    angleVertical: "eye_level",
    angleHorizontal: "rear",
    durationCat: "standard",
    isCompound: false,
    description:
      "Camera follows Fletcher from behind as he strides through the backstage corridor toward the stage.",
    subjects: ["Terence Fletcher"],
    mood: "commanding, predatory",
    lighting: "fluorescent backstage, cool blue tint",
    techniqueNotes:
      "Rear follow shot gives Fletcher the visual weight of a general entering battle.",
  },
  {
    sceneTitle: "Jazz Competition",
    startTc: 8.0,
    endTc: 14.5,
    duration: 6.5,
    movementType: "pan",
    direction: "left",
    speed: "moderate",
    shotSize: "medium_wide",
    angleVertical: "eye_level",
    angleHorizontal: "frontal",
    durationCat: "standard",
    isCompound: false,
    description:
      "Pan across the full band as they launch into Caravan. Brass section to rhythm section in one move.",
    subjects: ["jazz band", "instruments"],
    mood: "energetic, controlled",
    lighting: "stage lighting, warm spots",
    techniqueNotes:
      "The lateral pan establishes spatial relationships across the ensemble before the edit rhythm accelerates.",
  },
  {
    sceneTitle: "Jazz Competition",
    startTc: 14.5,
    endTc: 18.0,
    duration: 3.5,
    movementType: "rack_focus",
    direction: "in",
    speed: "fast",
    shotSize: "medium_close",
    angleVertical: "eye_level",
    angleHorizontal: "three_quarter",
    durationCat: "brief",
    isCompound: false,
    description:
      "Rack focus from Fletcher's conducting hand to Andrew behind the kit — the power dynamic in one shift.",
    subjects: ["Fletcher's hand", "Andrew Neiman"],
    mood: "tense, hierarchical",
    lighting: "stage lights, shallow depth of field",
    techniqueNotes:
      "The rack focus transfers attention without a cut, keeping both figures in the same frame.",
  },

  // --- Whiplash: Scene 3 — Final Performance ---
  {
    sceneTitle: "Final Performance",
    startTc: 0,
    endTc: 2.0,
    duration: 2.0,
    movementType: "whip_tilt",
    direction: "down",
    speed: "snap",
    shotSize: "close",
    angleVertical: "high_angle",
    angleHorizontal: "frontal",
    durationCat: "brief",
    isCompound: false,
    description:
      "Vertical whip from the stage lights down to Andrew's cymbals as he crashes into the opening.",
    subjects: ["stage lights", "cymbals", "Andrew"],
    mood: "explosive, defiant",
    lighting: "blazing stage spots, lens flare",
    techniqueNotes:
      "Whip tilt mirrors the energy transfer from light to sound, a kinetic match cut in motion.",
  },
  {
    sceneTitle: "Final Performance",
    startTc: 2.0,
    endTc: 18.5,
    duration: 16.5,
    movementType: "arc",
    direction: "clockwise",
    speed: "moderate",
    shotSize: "medium",
    angleVertical: "low_angle",
    angleHorizontal: "three_quarter",
    durationCat: "extended",
    isCompound: true,
    compoundParts: [
      { type: "arc", direction: "clockwise" },
      { type: "dolly", direction: "in" },
    ],
    description:
      "Clockwise arc around Andrew during the solo, gradually tightening as the intensity builds.",
    subjects: ["Andrew Neiman", "drum kit"],
    mood: "transcendent, unstoppable",
    lighting: "warm amber wash, sweat glistening",
    techniqueNotes:
      "Compound arc + dolly creates a vortex effect. The audience disappears as the frame closes in.",
  },
  {
    sceneTitle: "Final Performance",
    startTc: 18.5,
    endTc: 22.0,
    duration: 3.5,
    movementType: "dolly",
    direction: "out",
    speed: "slow",
    shotSize: "wide",
    angleVertical: "eye_level",
    angleHorizontal: "frontal",
    durationCat: "brief",
    isCompound: false,
    description:
      "Slow dolly out reveals the full audience in stunned silence. Andrew and Fletcher exchange a look.",
    subjects: ["Andrew", "Fletcher", "audience"],
    mood: "catharsis, recognition",
    lighting: "full stage wash, faces visible",
    techniqueNotes:
      "The pullback is the release — spatial expansion matching the emotional exhale after the solo.",
  },

  // --- Blade Runner 2049: Scene 1 — Protein Farm ---
  {
    sceneTitle: "Protein Farm",
    startTc: 0,
    endTc: 24.0,
    duration: 24.0,
    movementType: "aerial",
    direction: "forward",
    speed: "slow",
    shotSize: "extreme_wide",
    angleVertical: "birds_eye",
    angleHorizontal: "frontal",
    durationCat: "long_take",
    isCompound: false,
    description:
      "Aerial shot over endless rows of solar panels. K's spinner is a speck crossing the grid toward Morton's farm.",
    subjects: ["solar farm", "spinner vehicle"],
    mood: "desolate, expansive",
    lighting: "flat overcast, desaturated",
    techniqueNotes:
      "Deakins' aerial establishes the world's scale. The uniform grid dwarfs the human presence.",
  },
  {
    sceneTitle: "Protein Farm",
    startTc: 24.0,
    endTc: 36.0,
    duration: 12.0,
    movementType: "drone",
    direction: "down",
    speed: "slow",
    shotSize: "wide",
    angleVertical: "high_angle",
    angleHorizontal: "frontal",
    durationCat: "extended",
    isCompound: false,
    description:
      "Drone descends toward the farmhouse, revealing dead trees and the protein grubs beneath translucent tarps.",
    subjects: ["farmhouse", "dead tree", "protein grubs"],
    mood: "bleak, industrial",
    lighting: "grey overcast, no shadows",
    techniqueNotes:
      "The descent shift from aerial to ground-level perspective is a single continuous move.",
  },
  {
    sceneTitle: "Protein Farm",
    startTc: 36.0,
    endTc: 45.0,
    duration: 9.0,
    movementType: "steadicam",
    direction: "forward",
    speed: "moderate",
    shotSize: "medium_wide",
    angleVertical: "eye_level",
    angleHorizontal: "rear",
    durationCat: "standard",
    isCompound: false,
    description:
      "Steadicam follows K from behind as he walks toward Morton's door, hand near his weapon.",
    subjects: ["Officer K"],
    mood: "tense, methodical",
    lighting: "flat daylight, dust particles in air",
    techniqueNotes:
      "Rear steadicam withholds K's face, building tension through body language alone.",
  },

  // --- Blade Runner 2049: Scene 2 — Wallace Corporation ---
  {
    sceneTitle: "Wallace Corporation",
    startTc: 0,
    endTc: 20.0,
    duration: 20.0,
    movementType: "crane",
    direction: "down",
    speed: "imperceptible",
    shotSize: "wide",
    angleVertical: "high_angle",
    angleHorizontal: "frontal",
    durationCat: "extended",
    isCompound: false,
    description:
      "Crane descends through Wallace's cathedral HQ. Rippling water reflections play across every surface.",
    subjects: ["Wallace HQ interior", "water reflections"],
    mood: "divine, unsettling",
    lighting: "water caustics projected on walls, golden wash",
    techniqueNotes:
      "Deakins used water troughs with lights beneath to create the moving caustic patterns. The crane descent mimics a divine gaze.",
  },
  {
    sceneTitle: "Wallace Corporation",
    startTc: 20.0,
    endTc: 32.0,
    duration: 12.0,
    movementType: "dolly",
    direction: "lateral_right",
    speed: "slow",
    shotSize: "medium",
    angleVertical: "eye_level",
    angleHorizontal: "profile",
    durationCat: "extended",
    isCompound: false,
    description:
      "Lateral dolly as Wallace approaches the newborn replicant. His blind eyes turned toward her like a painter studying a canvas.",
    subjects: ["Niander Wallace", "newborn replicant"],
    mood: "clinical, godlike",
    lighting: "golden caustics, high contrast",
    techniqueNotes:
      "Profile framing puts Wallace and the replicant on the same visual plane — creator and creation.",
  },
  {
    sceneTitle: "Wallace Corporation",
    startTc: 32.0,
    endTc: 40.0,
    duration: 8.0,
    movementType: "pedestal",
    direction: "down",
    speed: "slow",
    shotSize: "medium_close",
    angleVertical: "eye_level",
    angleHorizontal: "frontal",
    durationCat: "standard",
    isCompound: false,
    description:
      "Camera pedestals down Wallace's face as he reaches his verdict. Water reflections ripple across his sightless eyes.",
    subjects: ["Niander Wallace", "water reflections"],
    mood: "judgment, cruelty",
    lighting: "golden caustics on face, dark background",
    techniqueNotes:
      "The pedestal adds weight to the moment — a descending judgment. Deakins' caustics make Wallace's face a shifting canvas.",
  },

  // --- Blade Runner 2049: Scene 3 — Las Vegas Ruins ---
  {
    sceneTitle: "Las Vegas Ruins",
    startTc: 0,
    endTc: 18.0,
    duration: 18.0,
    movementType: "handheld",
    direction: "forward",
    speed: "moderate",
    shotSize: "medium",
    angleVertical: "eye_level",
    angleHorizontal: "rear",
    durationCat: "extended",
    isCompound: false,
    description:
      "Handheld follows K through the orange haze of irradiated Las Vegas. Casino ruins emerge from the dust.",
    subjects: ["Officer K", "casino ruins"],
    mood: "eerie, alien",
    lighting: "monochromatic orange, volumetric haze",
    techniqueNotes:
      "Deakins achieved the orange by shooting through smoke with tungsten-balanced HMI lights. Handheld adds documentary urgency.",
  },
  {
    sceneTitle: "Las Vegas Ruins",
    startTc: 18.0,
    endTc: 30.0,
    duration: 12.0,
    movementType: "steadicam",
    direction: "forward",
    speed: "slow",
    shotSize: "wide",
    angleVertical: "eye_level",
    angleHorizontal: "frontal",
    durationCat: "extended",
    isCompound: true,
    compoundParts: [
      { type: "steadicam", direction: "forward" },
      { type: "tilt", direction: "up" },
    ],
    description:
      "Steadicam glides through the casino lobby, tilting up to reveal massive Elvis and Sinatra holograms stuttering in the haze.",
    subjects: ["casino lobby", "holograms", "Officer K"],
    mood: "haunted, nostalgic",
    lighting: "orange haze with holographic flicker",
    techniqueNotes:
      "Compound steadicam + tilt reveals the vertical space. The holograms are the ghosts of Las Vegas past.",
  },
  {
    sceneTitle: "Las Vegas Ruins",
    startTc: 30.0,
    endTc: 42.0,
    duration: 12.0,
    movementType: "dolly",
    direction: "in",
    speed: "slow",
    shotSize: "medium_close",
    angleVertical: "eye_level",
    angleHorizontal: "three_quarter",
    durationCat: "extended",
    isCompound: false,
    description:
      "Slow dolly toward Deckard sitting at a bar in the half-light, a glass of whiskey catching what glow remains.",
    subjects: ["Deckard", "bar", "whiskey glass"],
    mood: "weary, guarded",
    lighting: "warm amber through dust, isolated practical",
    techniqueNotes:
      "The dolly approach mirrors 2001's HAL shot — a slow convergence on a face that holds secrets.",
  },
  {
    sceneTitle: "Las Vegas Ruins",
    startTc: 42.0,
    endTc: 48.0,
    duration: 6.0,
    movementType: "static",
    direction: "none",
    speed: "freeze",
    shotSize: "ots",
    angleVertical: "eye_level",
    angleHorizontal: "ots",
    durationCat: "standard",
    isCompound: false,
    description:
      "Over-the-shoulder from K as he faces Deckard across the dusty bar. Neither moves.",
    subjects: ["Officer K", "Deckard"],
    mood: "standoff, recognition",
    lighting: "split amber/shadow, both faces half-lit",
    techniqueNotes:
      "The OTS frames the power dynamic — K initiates, Deckard holds ground. Static camera lets the tension build through stillness.",
  },
];

// ---------------------------------------------------------------------------
// Seed runner
// ---------------------------------------------------------------------------

async function main() {
  console.log("Clearing existing data...");
  await db.delete(schema.shotObjects);
  await db.delete(schema.shotEmbeddings);
  await db.delete(schema.verifications);
  await db.delete(schema.shotSemantic);
  await db.delete(schema.shotMetadata);
  await db.delete(schema.shots);
  await db.delete(schema.scenes);
  await db.delete(schema.films);

  // Insert films
  console.log("Inserting films...");
  const insertedFilms = await db
    .insert(schema.films)
    .values(
      FILMS.map((f) => ({
        title: f.title,
        director: f.director,
        year: f.year,
      })),
    )
    .returning({ id: schema.films.id, title: schema.films.title });

  const filmIdByTitle = new Map(insertedFilms.map((f) => [f.title, f.id]));

  // Try to enrich with TMDB data
  for (const film of FILMS) {
    const filmId = filmIdByTitle.get(film.title);
    if (!filmId) continue;

    try {
      const tmdbId = await searchTmdbMovieId(film.title, film.year);
      if (tmdbId) {
        const details = await fetchTmdbMovieDetails(tmdbId);
        if (details) {
          await db
            .update(schema.films)
            .set({
              tmdbId,
              posterUrl: details.posterUrl,
              backdropUrl: details.backdropUrl,
              overview: details.overview,
              runtime: details.runtime,
              genres: details.genres,
            })
            .where(eq(schema.films.id, filmId));
          console.log(`  TMDB enriched: ${film.title}`);
        }
      }
    } catch {
      console.log(`  TMDB unavailable for ${film.title} (skipped)`);
    }
  }

  // Insert scenes
  console.log("Inserting scenes...");
  const sceneValues = SCENES.map((s) => ({
    filmId: filmIdByTitle.get(s.filmTitle)!,
    sceneNumber: s.sceneNumber,
    title: s.title,
    description: s.description,
    location: s.location,
    interiorExterior: s.interiorExterior,
    timeOfDay: s.timeOfDay,
  }));

  const insertedScenes = await db
    .insert(schema.scenes)
    .values(sceneValues)
    .returning({
      id: schema.scenes.id,
      title: schema.scenes.title,
      filmId: schema.scenes.filmId,
    });

  // Build a lookup: sceneTitle -> sceneId
  const sceneIdByTitle = new Map(
    insertedScenes.map((s) => [s.title, s.id]),
  );

  // Compute scene durations and timecodes from shots
  const sceneShotDurations = new Map<string, { start: number; end: number }>();
  for (const shot of SHOTS) {
    const existing = sceneShotDurations.get(shot.sceneTitle);
    if (!existing) {
      sceneShotDurations.set(shot.sceneTitle, {
        start: shot.startTc,
        end: shot.endTc,
      });
    } else {
      existing.start = Math.min(existing.start, shot.startTc);
      existing.end = Math.max(existing.end, shot.endTc);
    }
  }

  // Update scene timecodes
  for (const [title, range] of sceneShotDurations) {
    const sceneId = sceneIdByTitle.get(title);
    if (!sceneId) continue;
    await db
      .update(schema.scenes)
      .set({
        startTc: range.start,
        endTc: range.end,
        totalDuration: range.end - range.start,
      })
      .where(eq(schema.scenes.id, sceneId));
  }

  // Insert shots with metadata and semantic data
  console.log("Inserting shots...");
  let shotCount = 0;

  for (const shot of SHOTS) {
    const sceneId = sceneIdByTitle.get(shot.sceneTitle);
    // Find the film for this scene
    const sceneDef = SCENES.find((s) => s.title === shot.sceneTitle);
    const filmId = sceneDef
      ? filmIdByTitle.get(sceneDef.filmTitle)
      : undefined;

    if (!filmId) {
      console.warn(`  Skipping shot — no film found for scene "${shot.sceneTitle}"`);
      continue;
    }

    const [insertedShot] = await db
      .insert(schema.shots)
      .values({
        filmId,
        sceneId: sceneId ?? null,
        startTc: shot.startTc,
        endTc: shot.endTc,
        duration: shot.duration,
      })
      .returning({ id: schema.shots.id });

    await db.insert(schema.shotMetadata).values({
      shotId: insertedShot.id,
      movementType: shot.movementType,
      direction: shot.direction,
      speed: shot.speed,
      shotSize: shot.shotSize,
      angleVertical: shot.angleVertical,
      angleHorizontal: shot.angleHorizontal,
      durationCat: shot.durationCat,
      isCompound: shot.isCompound,
      compoundParts: shot.compoundParts ?? null,
      classificationSource: "manual",
    });

    await db.insert(schema.shotSemantic).values({
      shotId: insertedShot.id,
      description: shot.description,
      subjects: shot.subjects,
      mood: shot.mood,
      lighting: shot.lighting,
      techniqueNotes: shot.techniqueNotes,
    });

    shotCount++;
  }

  console.log(`\nSeed complete:`);
  console.log(`  ${insertedFilms.length} films`);
  console.log(`  ${insertedScenes.length} scenes`);
  console.log(`  ${shotCount} shots (with metadata + semantic data)`);
}

// Need eq for updates
import { eq } from "drizzle-orm";

main().catch((error) => {
  console.error("Seeding failed.");
  console.error(error);
  process.exit(1);
});
