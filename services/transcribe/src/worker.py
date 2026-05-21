"""Worker entry point. Loads all models once, then runs the Temporal worker loop."""

from __future__ import annotations

import asyncio
import logging
import os
import sys

import torch
from dotenv import load_dotenv
from temporalio.client import Client
from temporalio.worker import Worker

from . import activities
from .models import initialize_models
from .storage import set_temporal_client

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


async def main() -> None:
    temporal_address = os.getenv("TEMPORAL_ADDRESS", "localhost:7233")
    identity = os.getenv("IDENTITY", "transcribe")
    task_queue = os.getenv("TRANSCRIBE_TASK_QUEUE", "transcribe")
    max_concurrent = int(os.getenv("MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS", "1"))

    whisper_model = os.getenv("WHISPER_MODEL", "base")
    wtpsplit_model = os.getenv("WTPSPLIT_MODEL", "sat-12l-sm")
    titanet_model = os.getenv("TITANET_MODEL", "nvidia/speakerverification_en_titanet_large")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    logger.info(
        f"starting transcribe worker: identity={identity} queue={task_queue} "
        f"temporal={temporal_address} device={device}"
    )
    logger.info(
        f"models: whisper={whisper_model} wtpsplit={wtpsplit_model} titanet={titanet_model}"
    )

    initialize_models(
        whisper_model=whisper_model,
        device=device,
        compute_type=compute_type,
        wtpsplit_model=wtpsplit_model,
        titanet_model=titanet_model,
    )
    logger.info("models initialized; connecting to Temporal")

    client = await Client.connect(temporal_address, identity=identity)
    set_temporal_client(client)

    worker = Worker(
        client,
        task_queue=task_queue,
        activities=[activities.transcribe],
        max_concurrent_activities=max_concurrent,
    )
    logger.info(f"polling task queue {task_queue!r}")
    await worker.run()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("stopped by user")
    except Exception:
        logger.exception("worker crashed")
        sys.exit(1)
