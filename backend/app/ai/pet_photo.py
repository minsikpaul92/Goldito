"""Pet photo to breed and coat suggestions (11.15 S2). The model guesses; the owner confirms. Nothing here is saved."""

from typing import Any

from pydantic import BaseModel

# The coat colors the app offers (and the Tamagotchi skins will use). The model must pick one of these.
COATS = ("white", "cream", "golden", "orange", "brown", "black", "gray", "mixed")
MAX_BREEDS = 3
MAX_BREED = 60


class RawGuess(BaseModel):
    species: str | None = None
    breeds: list[Any] = []  # loose on purpose: `clean` drops anything that is not a short text
    coat: str | None = None


class PhotoGuess(BaseModel):
    # False when the photo shows another animal than the one the owner chose, or no pet at all: then nothing is offered.
    species_match: bool
    breeds: list[str] = []
    coat_color: str | None = None


def clean(raw: RawGuess, declared_species: str) -> PhotoGuess:
    """Up to three distinct, short breed names and a coat from the fixed list. A wrong species offers nothing."""
    if (raw.species or "").strip().lower() != declared_species:
        return PhotoGuess(species_match=False)

    breeds: list[str] = []
    seen: set[str] = set()
    for name in raw.breeds:
        if not isinstance(name, str):
            continue
        tidy = " ".join(name.split())
        if not tidy or len(tidy) > MAX_BREED or tidy.lower() in seen:
            continue
        seen.add(tidy.lower())
        breeds.append(tidy)
        if len(breeds) == MAX_BREEDS:
            break

    coat = (raw.coat or "").strip().lower()
    return PhotoGuess(species_match=True, breeds=breeds, coat_color=coat if coat in COATS else None)
