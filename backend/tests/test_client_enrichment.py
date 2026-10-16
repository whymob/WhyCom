"""Offline regression tests: no third-party requests and no real API key."""
import importlib.util
import json
import socket
import sys
import types
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import client_enrichment as service

ORIGIN = "https://example.pt"
NIF = "509442013"


@pytest.mark.parametrize("ip", ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "::ffff:127.0.0.1", "192.168.1.2", "224.0.0.1", "ff02::1"])
def test_rejects_private_and_metadata_addresses(monkeypatch, ip):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *args, **kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))])
    with pytest.raises(service.DiscoveryError):
        service.public_host("example.pt")


def test_rejects_mixed_public_and_private_dns(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **kw: [(2, 1, 6, "", (ip, 443)) for ip in ("8.8.8.8", "127.0.0.1")])
    with pytest.raises(service.DiscoveryError):
        service.public_host("example.pt")


@pytest.mark.parametrize("website", ["http://example.pt", "https://user:pass@example.pt", "https://example.pt:8000", "https://localhost", "https://example.pt."])
def test_rejects_unsafe_website_inputs(website):
    with pytest.raises(service.DiscoveryError):
        service.website_origin(website=website)


def test_email_domain_is_candidate_not_person_name():
    assert service.website_origin("ana@example.pt") == ORIGIN
    with pytest.raises(service.DiscoveryError):
        service.website_origin("ana@gmail.com")
    assert service.website_origin("ana@gmail.com", "example.pt") == ORIGIN


def test_extracts_structured_fields_with_sources_and_valid_nif():
    html = '<script type="application/ld+json">' + json.dumps({"@graph": [{"@type": "Organization", "legalName": "Empresa Exemplo Lda", "taxID": "PT" + NIF, "address": {"streetAddress": "Rua Um", "postalCode": "1000-001", "addressLocality": "Lisboa"}}]}) + '</script><a href="tel:+351210000000">Ligar</a><a href="mailto:geral@example.pt">Email</a>'
    output, _, text = service.extract_page(html, ORIGIN)
    assert output["name"]["value"] == "Empresa Exemplo Lda"
    assert output["nif"]["value"] == NIF
    assert output["address"]["value"] == "Rua Um, 1000-001, Lisboa"
    assert output["contact_phone"]["source"] == ORIGIN
    assert "contact_person" not in output
    assert "@graph" not in text


def test_does_not_extract_unlabelled_or_invalid_nif():
    output, _, _ = service.extract_page("Referência 509442013. NIF: 509442014", ORIGIN)
    assert "nif" not in output
    output, _, _ = service.extract_page("NIF: 509 442 013", ORIGIN)
    assert output["nif"]["value"] == NIF


def test_meta_restrictions_are_honored():
    with pytest.raises(service.DiscoveryError):
        service.extract_page('<meta name="robots" content="noindex"><a href="tel:123">123</a>', ORIGIN)


def setup_site(monkeypatch, robots="User-agent: *\nAllow: /", page="", status=200):
    calls = []
    def fetch(url, allowed):
        calls.append(url)
        if url.endswith("robots.txt"):
            return 200, {}, robots, url
        return status, {}, page, url
    monkeypatch.setattr(service, "request_public", fetch)
    monkeypatch.setattr(service.time, "sleep", lambda _: None)
    return calls


def test_robots_disallow_prevents_content_request(monkeypatch):
    calls = setup_site(monkeypatch, robots="User-agent: *\nDisallow: /")
    result = service.discover(ORIGIN)
    assert calls == [ORIGIN + "/robots.txt"]
    assert result["suggestions"] == {}
    assert result["warnings"]


def test_robots_unavailable_fails_closed(monkeypatch):
    calls = []
    def fetch(url, allowed):
        calls.append(url)
        return 503, {}, "", url
    monkeypatch.setattr(service, "request_public", fetch)
    result = service.discover(ORIGIN)
    assert len(calls) == 1
    assert result["warnings"]


def test_only_three_content_urls_and_no_external_or_query_links(monkeypatch):
    html = '<meta property="og:site_name" content="Empresa">' + "".join(f'<a href="{url}">Link</a>' for url in ("/contactos", "/legal", "/about", "https://other.pt/contact", "/contact?x=1"))
    calls = setup_site(monkeypatch, page=html)
    result = service.discover(ORIGIN)
    assert len([url for url in calls if not url.endswith("robots.txt")]) == 3
    assert not any("other.pt" in url or "?" in url for url in calls)
    assert result["suggestions"]["name"]["value"] == "Empresa"


@pytest.mark.parametrize("status", [401, 403, 429])
def test_stops_on_access_limits(monkeypatch, status):
    calls = setup_site(monkeypatch, page='<a href="/contactos">Link</a>', status=status)
    assert service.discover(ORIGIN)["warnings"]
    assert len(calls) == 2


def test_long_crawl_delay_stops_without_fetching_content(monkeypatch):
    calls = setup_site(monkeypatch, robots="User-agent: *\nCrawl-delay: 20")
    assert service.discover(ORIGIN)["warnings"]
    assert len(calls) == 1


def test_redirect_rechecks_robots_before_target(monkeypatch):
    calls = []
    def fetch(url, allowed):
        calls.append(url)
        if url.endswith("robots.txt"):
            return 200, {}, "User-agent: *\nDisallow: /privado", url
        return 302, {}, "", ORIGIN + "/privado"
    monkeypatch.setattr(service, "request_public", fetch)
    monkeypatch.setattr(service.time, "sleep", lambda _: None)
    service.discover(ORIGIN)
    assert ORIGIN + "/privado" not in calls


def test_connection_uses_pinned_ip_and_original_tls_hostname(monkeypatch):
    monkeypatch.setattr(service, "public_host", lambda host: (host, "8.8.8.8"))
    connection = Mock()
    response = Mock(status=200)
    response.getheaders.return_value = [("Content-Type", "text/html")]
    response.read.side_effect = [b"ok", b""]
    connection.getresponse.return_value = response
    constructor = Mock(return_value=connection)
    monkeypatch.setattr(service.http.client, "HTTPSConnection", constructor)
    create = Mock()
    monkeypatch.setattr(service.socket, "create_connection", create)
    service.request_public(ORIGIN, {"example.pt"})
    connection._create_connection(("example.pt", 443), 6)
    assert constructor.call_args.args == ("example.pt",)
    create.assert_called_once_with(("8.8.8.8", 443), 6)


def test_local_ai_requires_literal_evidence_and_known_source(monkeypatch):
    monkeypatch.setenv("CLIENT_ENRICHMENT_AI_MODEL", "test")
    response = Mock()
    response.json.return_value = {"response": json.dumps({"fields": {"name": {"value": "Empresa Real", "source": ORIGIN}, "address": {"value": "Inventada", "source": ORIGIN}, "contact_phone": {"value": "123", "source": "https://evil.pt"}, "contact_person": {"value": "Empresa Real", "source": ORIGIN}}})}
    monkeypatch.setattr(service.requests, "post", Mock(return_value=response))
    output = {}
    assert service.organize_local([{"url": ORIGIN, "text": "Empresa Real 123"}], output)
    assert list(output) == ["name"]
    assert output["name"]["method"] == "local_ai"


def test_nif_response_matches_exact_nif_and_never_exposes_key(monkeypatch):
    monkeypatch.setenv("NIF_PT_API_KEY", "secret-test-only")
    body = {"result": "success", "records": {NIF: {"nif": int(NIF), "title": "Empresa Legal", "contacts": {"phone": "210000000"}, "place": {"address": "Rua Um", "city": "Lisboa"}}}}
    fetch = Mock(return_value=(200, {}, json.dumps(body), ""))
    monkeypatch.setattr(service, "request_public", fetch)
    output = service.lookup_nif(NIF)
    assert output["name"]["value"] == "Empresa Legal"
    assert "secret-test-only" not in json.dumps(output)
    body["records"][NIF]["nif"] = 123456789
    fetch.return_value = (200, {}, json.dumps(body), "")
    with pytest.raises(service.DiscoveryError):
        service.lookup_nif(NIF)


@pytest.fixture
def endpoint(monkeypatch):
    deps = types.ModuleType("deps")
    async def authenticated():
        raise HTTPException(401, "Não autenticado")
    deps.get_current_user = authenticated
    deps.db = None
    monkeypatch.setitem(sys.modules, "deps", deps)
    spec = importlib.util.spec_from_file_location("test_enrichment_router", Path(__file__).resolve().parents[1] / "routers" / "client_enrichment.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "reserve_quota", AsyncMock(return_value=True))
    monkeypatch.setattr(module, "cached", AsyncMock(return_value=None))
    monkeypatch.setattr(module, "save_cache", AsyncMock())
    monkeypatch.setattr(module, "organize_local", lambda *args: False)
    app = FastAPI()
    app.include_router(module.router, prefix="/api")
    with TestClient(app) as client:
        yield module, app, client, authenticated


def authenticate(endpoint):
    module, app, client, auth = endpoint
    app.dependency_overrides[auth] = lambda: {"id": "test-user"}
    return module, client


def test_endpoint_requires_authentication(endpoint):
    assert endpoint[2].post("/api/clients/enrich", json={"nif": NIF}).status_code == 401


def test_endpoint_fallback_works_when_site_unavailable(endpoint, monkeypatch):
    module, client = authenticate(endpoint)
    monkeypatch.setenv("NIF_PT_API_KEY", "test")
    monkeypatch.setattr(module, "discover", lambda _: {"suggestions": {}, "pages": [], "warnings": ["Site indisponível"]})
    fields = {"name": {"value": "Empresa Legal", "source": "https://www.nif.pt/", "method": "nif_pt"}}
    monkeypatch.setattr(module, "lookup_nif", lambda _: fields)
    response = client.post("/api/clients/enrich", json={"email": "ana@example.pt", "nif": NIF})
    assert response.status_code == 200
    assert response.json()["suggestions"] == fields
    assert "Site indisponível" in response.json()["warnings"]


def test_endpoint_keeps_site_fields_when_fallback_fills_missing(endpoint, monkeypatch):
    module, client = authenticate(endpoint)
    monkeypatch.setenv("NIF_PT_API_KEY", "test")
    monkeypatch.setattr(module, "discover", lambda _: {"suggestions": {"name": {"value": "Nome Publicado"}, "nif": {"value": NIF}}, "pages": [], "warnings": []})
    monkeypatch.setattr(module, "lookup_nif", lambda _: {"name": {"value": "Outro Nome"}, "address": {"value": "Lisboa"}})
    result = client.post("/api/clients/enrich", json={"website": ORIGIN}).json()
    assert result["suggestions"]["name"]["value"] == "Nome Publicado"
    assert result["suggestions"]["address"]["value"] == "Lisboa"


def test_user_limit_prevents_network_work(endpoint, monkeypatch):
    module, client = authenticate(endpoint)
    monkeypatch.setattr(module, "reserve_quota", AsyncMock(return_value=False))
    network = Mock()
    monkeypatch.setattr(module, "discover", network)
    assert client.post("/api/clients/enrich", json={"website": ORIGIN}).status_code == 429
    network.assert_not_called()


def test_nif_quota_blocks_fallback(endpoint, monkeypatch):
    module, client = authenticate(endpoint)
    monkeypatch.setenv("NIF_PT_API_KEY", "test")
    monkeypatch.setattr(module, "reserve_quota", AsyncMock(side_effect=[True, False]))
    network = Mock()
    monkeypatch.setattr(module, "lookup_nif", network)
    result = client.post("/api/clients/enrich", json={"nif": NIF})
    assert result.status_code == 200
    assert "limite" in " ".join(result.json()["warnings"])
    network.assert_not_called()


def test_website_cache_skips_network(endpoint, monkeypatch):
    module, client = authenticate(endpoint)
    monkeypatch.setattr(module, "cached", AsyncMock(return_value={"suggestions": {"name": {"value": "Cache"}}, "warnings": [], "ai_used": False}))
    network = Mock()
    monkeypatch.setattr(module, "discover", network)
    result = client.post("/api/clients/enrich", json={"website": ORIGIN})
    assert result.json()["suggestions"]["name"]["value"] == "Cache"
    network.assert_not_called()


def test_invalid_nif_and_empty_input_return_validation_error(endpoint):
    _, client = authenticate(endpoint)
    assert client.post("/api/clients/enrich", json={"nif": "509442014"}).status_code == 422
    assert client.post("/api/clients/enrich", json={}).status_code == 422


def test_nif_conflict_discards_site_data(endpoint, monkeypatch):
    module, client = authenticate(endpoint)
    monkeypatch.setenv("NIF_PT_API_KEY", "test")
    monkeypatch.setattr(module, "discover", lambda _: {"suggestions": {"name": {"value": "Empresa Errada"}, "nif": {"value": "999999990"}}, "pages": [], "warnings": []})
    fallback = Mock(return_value={"name": {"value": "Empresa Correta"}})
    monkeypatch.setattr(module, "lookup_nif", fallback)
    result = client.post("/api/clients/enrich", json={"website": ORIGIN, "nif": NIF}).json()
    assert result["suggestions"]["name"]["value"] == "Empresa Correta"
    fallback.assert_called_once_with(NIF)
    assert any("difere" in warning for warning in result["warnings"])


def test_ai_failure_preserves_extracted_data(endpoint, monkeypatch):
    module, client = authenticate(endpoint)
    monkeypatch.setattr(module, "discover", lambda _: {"suggestions": {"name": {"value": "Empresa"}}, "pages": [{"url": ORIGIN, "text": "Empresa"}], "warnings": []})
    monkeypatch.setattr(module, "organize_local", Mock(side_effect=ValueError("bad JSON")))
    result = client.post("/api/clients/enrich", json={"website": ORIGIN}).json()
    assert result["suggestions"]["name"]["value"] == "Empresa"
    assert not result["ai_used"]
    assert any("modelo local" in warning for warning in result["warnings"])
