"""Вопрос об уже посчитанной реакции. Зеркало frontend/src/lib/probe.ts.

Слой не меняет движок. Порядок вариантов воспроизводим побитово с офлайном;
общая фикстура проверяет и хеш, и перестановку, включая probe_vague.
"""
from dataclasses import dataclass

from app.protocol import ProbeView

REACTION_SCALE = (
    "walked_out", "offended", "hardened", "pressured", "not_yet",
    "neutral", "collaborated", "persuaded", "opened_up", "warmed",
)
OFF_SCALE = {"probe_vague": ("opened_up", "not_yet", "neutral")}
EVERY = 3


@dataclass(frozen=True)
class ProbeMemory:
    last_turn: int = 0
    last_reaction: str | None = None


def next_probe(reaction: str, turn: int, closed: bool,
               memory: ProbeMemory) -> ProbeView | None:
    if closed or turn < EVERY:
        return None
    since = turn - memory.last_turn
    if since < EVERY or (since == EVERY and reaction == memory.last_reaction):
        return None
    return build_probe(reaction, turn)


def build_probe(reaction: str, turn: int) -> ProbeView | None:
    if reaction in OFF_SCALE:
        near = list(OFF_SCALE[reaction])
    elif reaction in REACTION_SCALE:
        centre = REACTION_SCALE.index(reaction)
        near = []
        for distance in range(1, len(REACTION_SCALE)):
            for i in (centre - distance, centre + distance):
                if 0 <= i < len(REACTION_SCALE) and len(near) < 3:
                    near.append(REACTION_SCALE[i])
        if reaction == "opened_up":
            near[2] = "probe_vague"
    else:
        return None
    options = [reaction, *near]
    seed = 0x811C9DC5
    for char in f"{reaction}@{turn}":
        seed = ((seed ^ ord(char)) * 0x01000193) & 0xFFFFFFFF
    seed = seed or 1
    for i in range(len(options) - 1, 0, -1):
        seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF
        j = seed % (i + 1)
        options[i], options[j] = options[j], options[i]
    return ProbeView(turn=turn, options=options, answer=options.index(reaction))
