"""SimilarityWorldModel: predicts from the most similar past experiences.

Where NaiveWorldModel aggregates outcomes under an exact 4-field state key,
this model remembers each experience as a compact situation record and
predicts by retrieving the most similar records, weighting their outcomes
by similarity. The situation features are strictly richer than the naive
state key:

- door state (open/closed) and button state (pressed/unpressed) are
  distinguished, so "moving into an open door" no longer shares statistics
  with "moving into a closed one";
- position enters the similarity, decaying with Manhattan distance, which
  gives curiosity spatial resolution and stops rewards observed in one
  part of the map from bleeding into predictions elsewhere.

Records are bucketed by (action type, front kind). This is lossless:
different action types never match, and a mismatched front kind caps
similarity at 1 - FRONT_WEIGHT = 0.65, below MIN_SIMILARITY (0.75) —
so retrieval only ever needs to scan one bucket. If those constants
change, revisit the invariant (guarded by a test).
"""

from __future__ import annotations

import json
from typing import NamedTuple

from genesis.config import GenesisConfig
from genesis.environment.rules import entities_at, forward_position
from genesis.models.action import Action
from genesis.models.experience import Experience
from genesis.models.prediction import Prediction
from genesis.models.state import Entity, EntityType, Observation
from genesis.world_model.naive_model import (
    BASE_CONFIDENCE,
    CONFIDENCE_PER_SAMPLE,
    MAX_CONFIDENCE,
    NaiveWorldModel,
)

import uuid

# Similarity component weights (must sum to 1.0 so identical situations
# score exactly 1.0)
FRONT_WEIGHT = 0.35
KEY_WEIGHT = 0.15
HERE_WEIGHT = 0.10
POSITION_WEIGHT = 0.25
ORIENTATION_WEIGHT = 0.05
HAZARD_WEIGHT = 0.10
# Manhattan distance at which the position component reaches zero
POSITION_SCALE = 8.0
# Records below this similarity are not retrieved; a single mismatched
# front kind (1.0 - 0.35 = 0.65) is enough to be excluded.
MIN_SIMILARITY = 0.75
TOP_K = 25
# Minimum total similarity weight before retrieval overrides the rules
MIN_EVIDENCE = 1.0


class SituationFeatures(NamedTuple):
    action_type: str
    orientation: str
    has_key: bool
    x: int
    y: int
    front_kind: str
    here_kind: str
    hazard_near: bool = False  # a hazard is visible from here
    # Relative geometry of the nearest visible hazard, so the model can
    # anticipate individual hits instead of treating them as noise
    hazard_dx: int = 0
    hazard_dy: int = 0
    hazard_heading: str = "NONE"


class ExperienceRecord(NamedTuple):
    features: SituationFeatures
    success: bool
    reward: float
    prediction_error: float


def _cell_kind(entities: list[Entity]) -> str:
    """A state-aware label for what occupies a cell."""
    if not entities:
        return "NONE"
    entity = next((e for e in entities if e.blocking), entities[0])
    if entity.entity_type == EntityType.DOOR:
        return "DOOR_OPEN" if entity.is_open else "DOOR_CLOSED"
    if entity.entity_type == EntityType.BUTTON:
        return "BUTTON_PRESSED" if entity.pressed else "BUTTON_UNPRESSED"
    return entity.entity_type.value


def extract_features(
    observation: Observation, action: Action
) -> SituationFeatures:
    agent = observation.agent_state
    front = forward_position(agent)
    hazards = [
        e
        for e in observation.visible_entities
        if e.entity_type == EntityType.HAZARD and e.visible
    ]
    nearest_hazard = min(
        hazards,
        key=lambda e: e.position.manhattan_distance(agent.position),
        default=None,
    )
    return SituationFeatures(
        action_type=action.action_type.value,
        orientation=agent.orientation.value,
        has_key=bool(agent.inventory),
        x=agent.position.x,
        y=agent.position.y,
        front_kind=_cell_kind(
            entities_at(observation.visible_entities, front)
        ),
        here_kind=_cell_kind(
            entities_at(observation.visible_entities, agent.position)
        ),
        hazard_near=nearest_hazard is not None,
        hazard_dx=(
            nearest_hazard.position.x - agent.position.x
            if nearest_hazard
            else 0
        ),
        hazard_dy=(
            nearest_hazard.position.y - agent.position.y
            if nearest_hazard
            else 0
        ),
        hazard_heading=(
            (nearest_hazard.direction or "UNKNOWN")
            if nearest_hazard
            else "NONE"
        ),
    )


def similarity(a: SituationFeatures, b: SituationFeatures) -> float:
    """Graded similarity in [0, 1]; different action types never match."""
    if a.action_type != b.action_type:
        return 0.0
    score = 0.0
    if a.front_kind == b.front_kind:
        score += FRONT_WEIGHT
    if a.has_key == b.has_key:
        score += KEY_WEIGHT
    if a.here_kind == b.here_kind:
        score += HERE_WEIGHT
    if a.orientation == b.orientation:
        score += ORIENTATION_WEIGHT
    component = _hazard_component(a, b)
    score += HAZARD_WEIGHT * component
    distance = abs(a.x - b.x) + abs(a.y - b.y)
    score += POSITION_WEIGHT * max(0.0, 1.0 - distance / POSITION_SCALE)
    if a.hazard_near or b.hazard_near:
        # Hazard geometry gates the whole score: situations that only
        # look alike while the hazard sits somewhere else entirely are
        # not alike for hit prediction. Multiplicative and <= 1, so the
        # front-kind bucketing invariant still holds.
        score *= 0.5 + 0.5 * component
    return score


# Manhattan offset difference at which hazard geometry stops matching
_HAZARD_OFFSET_SCALE = 4.0


def _hazard_component(a: SituationFeatures, b: SituationFeatures) -> float:
    """Graded match of the relative hazard geometry, in [0, 1].

    Both hazard-free: full match. One-sided hazard: no match. Both with a
    hazard in view: half for the same heading, half decaying with how
    differently the hazard is placed relative to the agent.
    """
    if not a.hazard_near and not b.hazard_near:
        return 1.0
    if a.hazard_near != b.hazard_near:
        return 0.0
    score = 0.0
    if a.hazard_heading == b.hazard_heading:
        score += 0.5
    offset_gap = abs(a.hazard_dx - b.hazard_dx) + abs(
        a.hazard_dy - b.hazard_dy
    )
    score += 0.5 * max(0.0, 1.0 - offset_gap / _HAZARD_OFFSET_SCALE)
    return score


class SimilarityWorldModel(NaiveWorldModel):
    """Drop-in world model with similarity retrieval instead of exact keys.

    Reuses NaiveWorldModel's rule-based fallback; overrides learning and
    prediction to work from retrieved neighbors.
    """

    def __init__(self, config: GenesisConfig | None = None):
        super().__init__(config)
        # (action_type, front_kind) -> records; lossless bucketing, see
        # module docstring
        self._buckets: dict[tuple[str, str], list[ExperienceRecord]] = {}

    def update(self, experience: Experience) -> None:
        features = extract_features(
            experience.observation_before, experience.action
        )
        record = ExperienceRecord(
            features=features,
            success=experience.result.success,
            reward=experience.result.reward,
            prediction_error=experience.prediction_error,
        )
        self._buckets.setdefault(
            (features.action_type, features.front_kind), []
        ).append(record)

    def record_count(self) -> int:
        return sum(len(bucket) for bucket in self._buckets.values())

    def front_kind_reward(
        self, action_type: str, front_kind: str
    ) -> tuple[float, float]:
        """(samples, mean reward) over the whole (action, front-kind) bucket."""
        bucket = self._buckets.get((action_type, front_kind), [])
        if not bucket:
            return 0.0, 0.0
        return (
            float(len(bucket)),
            sum(record.reward for record in bucket) / len(bucket),
        )

    def front_kind_success(
        self, action_type: str, front_kind: str
    ) -> tuple[float, float]:
        """(samples, success rate) over the whole (action, front-kind) bucket."""
        bucket = self._buckets.get((action_type, front_kind), [])
        if not bucket:
            return 0.0, 0.0
        successes = sum(1 for record in bucket if record.success)
        return float(len(bucket)), successes / len(bucket)

    def hazard_context_reward(
        self, action_type: str | None = None
    ) -> tuple[float, float]:
        """(samples, mean reward) for acting with a hazard in view.

        action_type=None aggregates over every action — the estimate of
        what simply *being* in hazard territory costs per step.
        """
        samples = 0
        total = 0.0
        for (bucket_action, _), bucket in self._buckets.items():
            if action_type is not None and bucket_action != action_type:
                continue
            for record in bucket:
                if record.features.hazard_near:
                    samples += 1
                    total += record.reward
        if samples == 0:
            return 0.0, 0.0
        return float(samples), total / samples

    def dump_state(self) -> str:
        """Serialize learned records for snapshotting."""
        records = [
            [
                list(record.features),
                record.success,
                record.reward,
                record.prediction_error,
            ]
            for bucket in self._buckets.values()
            for record in bucket
        ]
        return json.dumps({"records": records})

    def load_state(self, payload: str) -> None:
        self._buckets = {}
        fields = SituationFeatures._fields
        defaults = SituationFeatures._field_defaults
        for raw_features, success, reward, error in json.loads(payload)[
            "records"
        ]:
            # Older snapshots may predate newer feature fields; pad the
            # tail with each missing field's declared default.
            raw_features = list(raw_features) + [
                defaults[name] for name in fields[len(raw_features):]
            ]
            features = SituationFeatures(*raw_features)
            self._buckets.setdefault(
                (features.action_type, features.front_kind), []
            ).append(
                ExperienceRecord(
                    features=features,
                    success=success,
                    reward=reward,
                    prediction_error=error,
                )
            )

    def predict(self, observation: Observation, action: Action) -> Prediction:
        success, reward, position, terminal, rationale = self._rule_prediction(
            observation, action
        )
        confidence = BASE_CONFIDENCE

        neighbors = self._retrieve(extract_features(observation, action))
        total_weight = sum(weight for weight, _ in neighbors)
        if total_weight >= MIN_EVIDENCE:
            success_rate = (
                sum(
                    weight
                    for weight, record in neighbors
                    if record.success
                )
                / total_weight
            )
            success = success_rate >= 0.5
            reward = (
                sum(weight * record.reward for weight, record in neighbors)
                / total_weight
            )
            confidence = min(
                MAX_CONFIDENCE,
                BASE_CONFIDENCE + CONFIDENCE_PER_SAMPLE * total_weight,
            )
            position = self._expected_position(observation, action, success)
            rationale = (
                f"similarity: {len(neighbors)} similar experiences,"
                f" weighted success rate {success_rate:.2f}"
            )

        return Prediction(
            prediction_id=uuid.uuid4().hex[:12],
            predicted_success=success,
            predicted_reward=reward,
            predicted_position=position,
            predicted_terminal=terminal,
            confidence=confidence,
            rationale=rationale,
        )

    def experience_stats(
        self, observation: Observation, action: Action
    ) -> tuple[float, float]:
        """(effective sample weight, similarity-weighted mean error).

        Effective weight is the sum of neighbor similarities, so curiosity
        decays gradually with distance from where experiences were made.
        """
        neighbors = self._retrieve(extract_features(observation, action))
        total_weight = sum(weight for weight, _ in neighbors)
        if total_weight == 0:
            return 0.0, 0.0
        mean_error = (
            sum(
                weight * record.prediction_error
                for weight, record in neighbors
            )
            / total_weight
        )
        return total_weight, mean_error

    def _retrieve(
        self, features: SituationFeatures
    ) -> list[tuple[float, ExperienceRecord]]:
        bucket = self._buckets.get(
            (features.action_type, features.front_kind), []
        )
        scored = []
        for record in bucket:
            weight = similarity(features, record.features)
            if weight >= MIN_SIMILARITY:
                scored.append((weight, record))
        scored.sort(key=lambda item: item[0], reverse=True)
        return scored[:TOP_K]
