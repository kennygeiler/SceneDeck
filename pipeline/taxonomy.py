from typing import Final, TypedDict


class TaxonomyEntry(TypedDict):
    slug: str
    displayName: str


FRAMINGS: Final[dict[str, TaxonomyEntry]] = {
    "rule_of_thirds_left": {"slug": "rule_of_thirds_left", "displayName": "Rule of Thirds (Left)"},
    "rule_of_thirds_right": {"slug": "rule_of_thirds_right", "displayName": "Rule of Thirds (Right)"},
    "centered": {"slug": "centered", "displayName": "Centered"},
    "off_center": {"slug": "off_center", "displayName": "Off Center"},
    "split": {"slug": "split", "displayName": "Split Frame"},
    "frame_within_frame": {"slug": "frame_within_frame", "displayName": "Frame Within Frame"},
    "negative_space_dominant": {"slug": "negative_space_dominant", "displayName": "Negative Space Dominant"},
    "filled": {"slug": "filled", "displayName": "Filled Frame"},
    "leading_lines": {"slug": "leading_lines", "displayName": "Leading Lines"},
    "golden_ratio": {"slug": "golden_ratio", "displayName": "Golden Ratio"},
}

DEPTH_TYPES: Final[dict[str, TaxonomyEntry]] = {
    "shallow": {"slug": "shallow", "displayName": "Shallow"},
    "medium": {"slug": "medium", "displayName": "Medium"},
    "deep_staging": {"slug": "deep_staging", "displayName": "Deep Staging"},
    "flat": {"slug": "flat", "displayName": "Flat"},
    "layered": {"slug": "layered", "displayName": "Layered"},
    "rack_focus": {"slug": "rack_focus", "displayName": "Rack Focus"},
}

BLOCKING_TYPES: Final[dict[str, TaxonomyEntry]] = {
    "single": {"slug": "single", "displayName": "Single Figure"},
    "two_figure": {"slug": "two_figure", "displayName": "Two Figure"},
    "two_figure_separation": {"slug": "two_figure_separation", "displayName": "Two Figure (Separated)"},
    "group": {"slug": "group", "displayName": "Group"},
    "crowd": {"slug": "crowd", "displayName": "Crowd"},
    "empty": {"slug": "empty", "displayName": "Empty Frame"},
    "silhouette": {"slug": "silhouette", "displayName": "Silhouette"},
    "reflection": {"slug": "reflection", "displayName": "Reflection"},
}

SYMMETRY_TYPES: Final[dict[str, TaxonomyEntry]] = {
    "symmetric": {"slug": "symmetric", "displayName": "Symmetric"},
    "asymmetric": {"slug": "asymmetric", "displayName": "Asymmetric"},
    "balanced": {"slug": "balanced", "displayName": "Balanced"},
    "unbalanced": {"slug": "unbalanced", "displayName": "Unbalanced"},
}

DOMINANT_LINES: Final[dict[str, TaxonomyEntry]] = {
    "vertical": {"slug": "vertical", "displayName": "Vertical"},
    "horizontal": {"slug": "horizontal", "displayName": "Horizontal"},
    "diagonal": {"slug": "diagonal", "displayName": "Diagonal"},
    "curved": {"slug": "curved", "displayName": "Curved"},
    "converging": {"slug": "converging", "displayName": "Converging"},
    "radiating": {"slug": "radiating", "displayName": "Radiating"},
    "none": {"slug": "none", "displayName": "None"},
}

LIGHTING_DIRECTIONS: Final[dict[str, TaxonomyEntry]] = {
    "front": {"slug": "front", "displayName": "Front"},
    "side": {"slug": "side", "displayName": "Side"},
    "back": {"slug": "back", "displayName": "Back / Rim"},
    "top": {"slug": "top", "displayName": "Top / Overhead"},
    "bottom": {"slug": "bottom", "displayName": "Bottom / Under"},
    "natural": {"slug": "natural", "displayName": "Natural / Available"},
    "mixed": {"slug": "mixed", "displayName": "Mixed"},
}

LIGHTING_QUALITIES: Final[dict[str, TaxonomyEntry]] = {
    "hard": {"slug": "hard", "displayName": "Hard"},
    "soft": {"slug": "soft", "displayName": "Soft"},
    "diffused": {"slug": "diffused", "displayName": "Diffused"},
    "high_contrast": {"slug": "high_contrast", "displayName": "High Contrast"},
    "low_contrast": {"slug": "low_contrast", "displayName": "Low Contrast"},
    "chiaroscuro": {"slug": "chiaroscuro", "displayName": "Chiaroscuro"},
}

COLOR_TEMPERATURES: Final[dict[str, TaxonomyEntry]] = {
    "warm": {"slug": "warm", "displayName": "Warm"},
    "cool": {"slug": "cool", "displayName": "Cool"},
    "neutral": {"slug": "neutral", "displayName": "Neutral"},
    "mixed": {"slug": "mixed", "displayName": "Mixed"},
    "desaturated": {"slug": "desaturated", "displayName": "Desaturated"},
    "saturated": {"slug": "saturated", "displayName": "Saturated"},
}

SHOT_SIZES: Final[dict[str, TaxonomyEntry]] = {
    "extreme_wide": {"slug": "extreme_wide", "displayName": "Extreme Wide"},
    "wide": {"slug": "wide", "displayName": "Wide"},
    "full": {"slug": "full", "displayName": "Full"},
    "medium_wide": {"slug": "medium_wide", "displayName": "Medium Wide"},
    "medium": {"slug": "medium", "displayName": "Medium"},
    "medium_close": {"slug": "medium_close", "displayName": "Medium Close"},
    "close": {"slug": "close", "displayName": "Close"},
    "extreme_close": {"slug": "extreme_close", "displayName": "Extreme Close"},
    "insert": {"slug": "insert", "displayName": "Insert"},
    "two_shot": {"slug": "two_shot", "displayName": "Two Shot"},
    "three_shot": {"slug": "three_shot", "displayName": "Three Shot"},
    "group": {"slug": "group", "displayName": "Group"},
    "ots": {"slug": "ots", "displayName": "OTS"},
    "pov": {"slug": "pov", "displayName": "POV"},
    "reaction": {"slug": "reaction", "displayName": "Reaction"},
}

VERTICAL_ANGLES: Final[dict[str, TaxonomyEntry]] = {
    "eye_level": {"slug": "eye_level", "displayName": "Eye Level"},
    "high_angle": {"slug": "high_angle", "displayName": "High Angle"},
    "low_angle": {"slug": "low_angle", "displayName": "Low Angle"},
    "birds_eye": {"slug": "birds_eye", "displayName": "Bird's Eye"},
    "worms_eye": {"slug": "worms_eye", "displayName": "Worm's Eye"},
    "overhead": {"slug": "overhead", "displayName": "Overhead"},
}

HORIZONTAL_ANGLES: Final[dict[str, TaxonomyEntry]] = {
    "frontal": {"slug": "frontal", "displayName": "Frontal"},
    "profile": {"slug": "profile", "displayName": "Profile"},
    "three_quarter": {"slug": "three_quarter", "displayName": "Three Quarter"},
    "rear": {"slug": "rear", "displayName": "Rear"},
    "ots": {"slug": "ots", "displayName": "OTS"},
}

DURATION_CATEGORIES: Final[dict[str, TaxonomyEntry]] = {
    "flash": {"slug": "flash", "displayName": "Flash"},
    "brief": {"slug": "brief", "displayName": "Brief"},
    "standard": {"slug": "standard", "displayName": "Standard"},
    "extended": {"slug": "extended", "displayName": "Extended"},
    "long_take": {"slug": "long_take", "displayName": "Long Take"},
    "oner": {"slug": "oner", "displayName": "Oner"},
}


# ---------------------------------------------------------------------------
# Slug validation
# ---------------------------------------------------------------------------

_ALL_VALID_SLUGS: dict[str, set[str]] = {
    "framing": set(FRAMINGS.keys()),
    "depth": set(DEPTH_TYPES.keys()),
    "blocking": set(BLOCKING_TYPES.keys()),
    "symmetry": set(SYMMETRY_TYPES.keys()),
    "dominant_lines": set(DOMINANT_LINES.keys()),
    "lighting_direction": set(LIGHTING_DIRECTIONS.keys()),
    "lighting_quality": set(LIGHTING_QUALITIES.keys()),
    "color_temperature": set(COLOR_TEMPERATURES.keys()),
    "shot_size": set(SHOT_SIZES.keys()),
    "angle_vertical": set(VERTICAL_ANGLES.keys()),
    "angle_horizontal": set(HORIZONTAL_ANGLES.keys()),
    "duration_cat": set(DURATION_CATEGORIES.keys()),
}


def validate_taxonomy_slug(field: str, value: str | None) -> None:
    """Assert that a taxonomy value belongs to the canonical slug set."""
    if value is None:
        return
    valid = _ALL_VALID_SLUGS.get(field)
    if valid is None:
        raise ValueError(f"Unknown taxonomy field: {field}")
    if value not in valid:
        raise ValueError(
            f"Invalid {field} slug: '{value}'. "
            f"Valid values: {sorted(valid)}"
        )
