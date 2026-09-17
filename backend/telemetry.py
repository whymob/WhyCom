"""OpenTelemetry setup for HTTP and MongoDB performance traces.

No request headers, bodies, MongoDB filters, or document values are attached to
spans. This keeps CRM, authentication, and financial data out of Jaeger.
"""
import logging
import os

from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.pymongo import PymongoInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, SERVICE_VERSION, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


logger = logging.getLogger("whymob.telemetry")


def configure_telemetry(app: FastAPI) -> None:
    """Exports backend and MongoDB timings to an OTLP-compatible collector."""
    enabled = os.environ.get("OTEL_ENABLED", "false").lower() in {"1", "true", "yes"}
    if not enabled:
        logger.info("OpenTelemetry disabled by OTEL_ENABLED")
        return

    resource = Resource.create({
        SERVICE_NAME: os.environ.get("OTEL_SERVICE_NAME", "whymob-backend"),
        SERVICE_VERSION: os.environ.get("APP_VERSION", "unknown"),
        "deployment.environment": os.environ.get("APP_ENV", "development"),
    })
    provider = TracerProvider(resource=resource)
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "http://jaeger:4318/v1/traces")
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
    trace.set_tracer_provider(provider)

    # Health checks create high-volume, low-value traces, so exclude them.
    FastAPIInstrumentor.instrument_app(app, excluded_urls="/api/health")
    # The PyMongo instrumentation records command name, collection and duration.
    # It deliberately does not receive application payloads from this setup.
    PymongoInstrumentor().instrument(
        tracer_provider=provider,
        capture_statement=False,
    )
    logger.info("OpenTelemetry enabled; exporting traces to %s", endpoint)
