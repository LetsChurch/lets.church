"""Speaker diarization using NVIDIA NeMo titanet embeddings + clustering.

Pipeline:
  1. Slice each whisper segment into overlapping fixed-size windows.
  2. Batch-extract a titanet_large embedding (192-dim) per window.
  3. Average a segment's window embeddings into one per-segment embedding.
  4. Agglomerative-cluster the per-segment embeddings (cosine distance).
  5. Each segment takes its cluster's label directly; per-cluster mean embedding
     becomes the speaker vector.

Clustering on segments (not windows) keeps the O(N^2) agglomerative step small —
N is the number of speech segments, ~10x fewer points than windows — and the
embedding pass is batched so the GPU isn't fed one 1.5s clip at a time.

This intentionally does not depend on pyannote — VAD is provided upstream by
faster-whisper's `vad_filter=True`, so whisper segment timings define the
candidate speech intervals.
"""

from __future__ import annotations

import logging

import numpy as np
import torch
from sklearn.cluster import AgglomerativeClustering
from sklearn.preprocessing import normalize

from .audio import SAMPLE_RATE
from .windowing import Window, windows_for_segment

logger = logging.getLogger(__name__)


def _slice_audio(audio: np.ndarray, start: float, end: float, sr: int) -> np.ndarray:
    f1 = max(0, int(start * sr))
    f2 = min(audio.shape[0], int(end * sr))
    return audio[f1:f2]


class TitanetDiarizer:
    """Diarization built on top of NeMo's titanet_large speaker encoder."""

    def __init__(
        self,
        device: str = "cpu",
        model_name: str = "nvidia/speakerverification_en_titanet_large",
        window_size: float = 1.5,
        hop: float = 0.75,
        min_window_size: float = 0.5,
        embed_batch_size: int = 64,
    ):
        from nemo.collections.asr.models import EncDecSpeakerLabelModel

        logger.info(f"Loading titanet speaker model: {model_name}")
        self.device = device
        self.window_size = window_size
        self.hop = hop
        self.min_window_size = min_window_size
        self.embed_batch_size = embed_batch_size

        self.model = EncDecSpeakerLabelModel.from_pretrained(model_name)
        self.model = self.model.to(device)
        self.model.eval()
        logger.info("titanet model loaded")

    @torch.inference_mode()
    def _embed_batch(self, chunks: list[np.ndarray]) -> np.ndarray:
        """Embed a batch of variable-length audio chunks; returns (B, D)."""
        min_len = int(self.min_window_size * SAMPLE_RATE)
        padded = [
            c if c.shape[0] >= min_len else np.pad(c, (0, min_len - c.shape[0])) for c in chunks
        ]
        max_len = max(c.shape[0] for c in padded)

        batch = np.zeros((len(padded), max_len), dtype=np.float32)
        lengths = np.empty(len(padded), dtype=np.int64)
        for i, c in enumerate(padded):
            batch[i, : c.shape[0]] = c
            lengths[i] = c.shape[0]

        signal = torch.from_numpy(batch).to(self.device)
        length = torch.from_numpy(lengths).to(self.device)
        # Call the module (not .forward) so nn.Module hooks / NeMo type-checks run.
        _logits, emb = self.model(input_signal=signal, input_signal_length=length)
        return emb.cpu().numpy()

    def _embed_windows(self, audio: np.ndarray, windows: list[Window], sr: int) -> np.ndarray:
        """Batch-embed every window; returns (n_windows, D)."""
        chunks = [_slice_audio(audio, w.start, w.end, sr) for w in windows]
        out: list[np.ndarray] = []
        for i in range(0, len(chunks), self.embed_batch_size):
            out.append(self._embed_batch(chunks[i : i + self.embed_batch_size]))
        return np.concatenate(out, axis=0)

    def diarize(
        self,
        audio: np.ndarray,
        segments: list[dict],
        sr: int = SAMPLE_RATE,
        min_speakers: int | None = None,
        max_speakers: int | None = 8,
        distance_threshold: float = 0.7,
    ) -> tuple[list[str | None], dict[str, list[float]]]:
        """Assign a speaker label per whisper segment.

        Returns:
            (per_segment_labels, speaker_vectors) where speaker_vectors maps
            "SPEAKER_NN" to a 192-dim list[float] representing that speaker's
            mean normalized titanet embedding.
        """
        if not segments:
            return [], {}

        # Build windows that cover every segment, tracking each window's segment.
        windows: list[Window] = []
        for i, seg in enumerate(segments):
            windows.extend(
                windows_for_segment(i, seg["start"], seg["end"], self.window_size, self.hop)
            )

        if not windows:
            return [None] * len(segments), {}

        # Batch-embed windows, L2-normalize, then pool into one embedding per segment.
        window_embeddings = normalize(self._embed_windows(audio, windows, sr))

        seg_to_window_idxs: dict[int, list[int]] = {}
        for wi, w in enumerate(windows):
            seg_to_window_idxs.setdefault(w.seg_index, []).append(wi)

        present_seg_indices = sorted(seg_to_window_idxs.keys())
        seg_embeddings = np.stack(
            [window_embeddings[seg_to_window_idxs[si]].mean(axis=0) for si in present_seg_indices]
        )
        seg_embeddings = normalize(seg_embeddings)

        # Cluster the per-segment embeddings.
        if seg_embeddings.shape[0] == 1:
            cluster_labels = np.zeros(1, dtype=np.int64)
        else:
            n_clusters: int | None = None
            if min_speakers is not None and min_speakers == max_speakers:
                n_clusters = min_speakers

            clustering = AgglomerativeClustering(
                n_clusters=n_clusters,
                distance_threshold=None if n_clusters is not None else distance_threshold,
                metric="cosine",
                linkage="average",
            )
            cluster_labels = clustering.fit_predict(seg_embeddings)

            # Cap the number of speakers if requested by merging the smallest clusters
            # into the nearest larger one. Cheap heuristic, matches what pyannote does
            # downstream when min/max_speakers are specified.
            if max_speakers is not None and len(set(cluster_labels)) > max_speakers:
                cluster_labels = _cap_clusters(seg_embeddings, cluster_labels, max_speakers)
            if min_speakers is not None and len(set(cluster_labels)) < min_speakers:
                # Can't synthesize speakers; just leave as-is.
                pass

        # Map cluster ids to stable SPEAKER_NN labels, ordered by first appearance.
        label_map: dict[int, str] = {}
        for cid in cluster_labels:
            if int(cid) not in label_map:
                label_map[int(cid)] = f"SPEAKER_{len(label_map):02d}"

        # Each present segment takes its cluster's label directly (no window vote).
        per_segment_labels: list[str | None] = [None] * len(segments)
        for si, cid in zip(present_seg_indices, cluster_labels, strict=True):
            per_segment_labels[si] = label_map[int(cid)]

        # Speaker centroid vectors (mean of per-segment embeddings, then re-normalized).
        speaker_vectors: dict[str, list[float]] = {}
        for cid, spk in label_map.items():
            mask = cluster_labels == cid
            if not mask.any():
                continue
            centroid = seg_embeddings[mask].mean(axis=0)
            n = np.linalg.norm(centroid)
            if n > 0:
                centroid = centroid / n
            speaker_vectors[spk] = centroid.astype(np.float32).tolist()

        return per_segment_labels, speaker_vectors


def _cap_clusters(embeddings: np.ndarray, labels: np.ndarray, max_speakers: int) -> np.ndarray:
    """Reduce label count to at most `max_speakers` by merging smallest clusters first."""
    labels = labels.copy()
    while len(set(labels)) > max_speakers:
        # Count cluster sizes.
        unique, counts = np.unique(labels, return_counts=True)
        order = np.argsort(counts)
        smallest = unique[order[0]]

        # Centroid of `smallest`.
        small_centroid = embeddings[labels == smallest].mean(axis=0)
        small_centroid = small_centroid / max(np.linalg.norm(small_centroid), 1e-9)

        # Best other cluster to merge into.
        best_other, best_score = None, -np.inf
        for other in unique:
            if other == smallest:
                continue
            c = embeddings[labels == other].mean(axis=0)
            c = c / max(np.linalg.norm(c), 1e-9)
            score = float(np.dot(small_centroid, c))
            if score > best_score:
                best_score = score
                best_other = other

        if best_other is None:
            raise RuntimeError("no other cluster found to merge with")
        labels[labels == smallest] = best_other
    return labels


def assign_word_speakers(segments: list[dict]) -> None:
    """Propagate each segment's speaker to its words in-place."""
    for seg in segments:
        spk = seg.get("speaker")
        if spk is None:
            continue
        for word in seg.get("words", []):
            word["speaker"] = spk
