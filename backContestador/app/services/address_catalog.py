from __future__ import annotations

import hashlib
import json
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any

from app.extensions import db
from app.models import GeoCatalogVersion, GeoLocality, GeoSettlement, GeoStreet


INEGI_BASE = "https://gaia.inegi.org.mx/wscatgeo/v2"
INEGI_ATTRIBUTION = (
    "Fuente: Instituto Nacional de Estadística y Geografía (INEGI), "
    "Catálogo Único de Claves Geoestadísticas. Datos consultados para referencia; "
    "sin respaldo ni certificación de INEGI."
)
ROAD_TYPE_PREFIXES = {
    "avenida", "av", "avda", "boulevard", "blvd", "bulevar", "calle", "c", "calzada",
    "calz", "carretera", "carr", "andador", "and", "privada", "priv", "prolongacion",
    "prol", "cerrada", "retorno", "circuito", "eje", "viaducto", "camino",
}


def normalize_address_name(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").casefold())
    text = "".join(char for char in text if not unicodedata.combining(char))
    tokens = re.findall(r"[a-z0-9]+", text)
    while tokens and tokens[0] in ROAD_TYPE_PREFIXES:
        tokens.pop(0)
    return " ".join(tokens)


def _normalize_locality_query(value: Any) -> str:
    first = str(value or "").split(",", 1)[0]
    normalized = normalize_address_name(first)
    tokens = [token for token in normalized.split() if token not in {"baja", "california", "bc", "mexico", "mex"}]
    return " ".join(tokens)


def _fetch_json(url: str) -> tuple[bytes, list[dict[str, Any]]]:
    request = urllib.request.Request(url, headers={"User-Agent": "ContestadorAutomatic/1.0"})
    with urllib.request.urlopen(request, timeout=40) as response:
        raw = response.read(64 * 1024 * 1024 + 1)
    if len(raw) > 64 * 1024 * 1024:
        raise ValueError("El catálogo excede el límite de importación de 64 MiB.")
    parsed = json.loads(raw)
    rows = parsed if isinstance(parsed, list) else parsed.get("datos", parsed.get("data", []))
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ValueError("INEGI devolvió un formato de catálogo inesperado.")
    return raw, rows


def _value(row: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return str(value).strip()
    lower = {str(key).casefold(): value for key, value in row.items()}
    for key in keys:
        value = lower.get(key.casefold())
        if value not in (None, ""):
            return str(value).strip()
    return ""


def _records(rows: list[dict[str, Any]], kind: str) -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for row in rows:
        raw_locality_code = _value(row, "cve_loc", "locality_code")
        if not raw_locality_code:
            geo_key = _value(row, "cve_geo", "cvegeo")
            raw_locality_code = geo_key[5:9] if len(geo_key) >= 9 else ""
        locality_code = raw_locality_code.zfill(4)
        name = _value(row, "nomvial", "nom_asen", "nomgeo", "nom_loc", "nombre", "name")
        normalized = normalize_address_name(name)
        if not locality_code.isdigit() or locality_code == "0000" or not name or not normalized:
            continue

        if kind == "locality":
            source_key = locality_code
            record = {
                "locality_code": locality_code,
                "name": name[:160],
                "normalized_name": normalized[:160],
            }
        else:
            key = _value(row, "cvevial", "cve_asen", "id", "source_key")
            geo_key = _value(row, "cve_geo")
            source_key = f"{geo_key}-{key}" if geo_key and key else f"{locality_code}-{key}" if key else ""
            if not source_key:
                serialized_row = json.dumps(row, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
                digest = hashlib.sha256(f"{kind}:{locality_code}:{serialized_row}".encode()).hexdigest()[:16]
                source_key = f"{locality_code}-{digest}"
            record = {
                "locality_code": locality_code,
                "source_key": source_key[:32],
                "name": name[:200],
                "normalized_name": normalized[:200],
                "locality_name": _value(row, "nom_loc", "locality_name")[:160] or None,
            }
            if kind == "street":
                record["street_type"] = _value(row, "tipovial", "street_type")[:40] or None
            else:
                record["settlement_type"] = _value(row, "tipo_asen", "settlement_type")[:40] or None
        output[source_key] = record
    return output


def _bulk_insert(model, rows: list[dict[str, Any]], batch_size: int = 1000) -> None:
    for start in range(0, len(rows), batch_size):
        db.session.execute(db.insert(model), rows[start : start + batch_size])


def delivery_coverage_status(
    *, business, settlement_key: str, locality_code: str, catalog_version_id: int
) -> str:
    """Check coverage by INEGI settlement key, catalog version and locality."""
    configured_keys = {
        str(key)
        for zone in business.delivery_zones
        if zone.is_active
        for key in (zone.settlement_keys or [])
        if str(key).strip()
    }
    if not configured_keys or not business.locality_code:
        return "unknown"
    if str(locality_code).zfill(4) != str(business.locality_code).zfill(4):
        return "out_of_coverage"
    if catalog_version_id != business.geo_catalog_version_id:
        return "unknown"
    return "in_coverage" if str(settlement_key) in configured_keys else "out_of_coverage"


def import_inegi_address_catalog(
    *,
    entity_code: str,
    municipality_code: str,
    entity_name: str | None = None,
    municipality_name: str | None = None,
) -> dict[str, Any]:
    entity_code = str(entity_code).strip().zfill(2)
    municipality_code = str(municipality_code).strip().zfill(3)
    if not re.fullmatch(r"\d{2}", entity_code) or not re.fullmatch(r"\d{3}", municipality_code):
        raise ValueError("Las claves de entidad y municipio deben usar dos y tres dígitos.")
    # This v2 service has no edition selector. Identify a snapshot by import
    # date and use the payload checksum as its precise identity.
    edition = f"live-{datetime.now(timezone.utc).date().isoformat()}"

    scoped = f"{entity_code}/{municipality_code}"
    urls = {
        "localities": f"{INEGI_BASE}/localidades/{entity_code}{municipality_code}",
        "streets": f"{INEGI_BASE}/vialidades/{scoped}",
        "settlements": f"{INEGI_BASE}/asentamientos/{scoped}",
    }
    raw_payloads: list[bytes] = []
    data: dict[str, dict[str, dict[str, Any]]] = {}
    for kind, url in urls.items():
        raw, rows = _fetch_json(url)
        raw_payloads.append(raw)
        data[kind] = _records(rows, "locality" if kind == "localities" else kind[:-1])
    localities = data["localities"]
    # The locality service may omit a rural locality that is present in a street
    # or settlement record; include only named localities surfaced by those rows.
    for kind in ("streets", "settlements"):
        for record in data[kind].values():
            locality_code = record["locality_code"]
            if locality_code not in localities:
                locality_name = record.get("locality_name")
                if locality_name:
                    localities[locality_code] = {
                        "locality_code": locality_code,
                        "name": locality_name[:160],
                        "normalized_name": normalize_address_name(locality_name)[:160],
                    }
    if not localities or not data["streets"] or not data["settlements"]:
        raise ValueError("INEGI devolvió un catálogo vacío o incompleto; no se reemplazaron datos.")

    checksum = hashlib.sha256(b"\n".join(raw_payloads)).hexdigest()
    catalog = GeoCatalogVersion.query.filter_by(
        source="INEGI",
        edition=edition,
        entity_code=entity_code,
        municipality_code=municipality_code,
    ).first()
    if catalog is None:
        catalog = GeoCatalogVersion(
            source="INEGI",
            edition=edition,
            entity_code=entity_code,
            municipality_code=municipality_code,
            entity_name=entity_name,
            municipality_name=municipality_name,
            checksum_sha256=checksum,
            source_url=";".join(urls.values()),
            attribution=INEGI_ATTRIBUTION,
        )
        db.session.add(catalog)
        db.session.flush()
    else:
        catalog.entity_name = entity_name or catalog.entity_name
        catalog.municipality_name = municipality_name or catalog.municipality_name
        catalog.checksum_sha256 = checksum
        catalog.source_url = ";".join(urls.values())
        catalog.attribution = INEGI_ATTRIBUTION
        db.session.query(GeoLocality).filter_by(catalog_version_id=catalog.id).delete(synchronize_session=False)
        db.session.query(GeoStreet).filter_by(catalog_version_id=catalog.id).delete(synchronize_session=False)
        db.session.query(GeoSettlement).filter_by(catalog_version_id=catalog.id).delete(synchronize_session=False)
        db.session.flush()

    for model, key in (
        (GeoLocality, "localities"),
        (GeoStreet, "streets"),
        (GeoSettlement, "settlements"),
    ):
        rows = [dict(row, catalog_version_id=catalog.id) for row in data[key].values()]
        _bulk_insert(model, rows)
    db.session.commit()
    return {
        "catalog_version_id": catalog.id,
        "entity_code": entity_code,
        "municipality_code": municipality_code,
        "edition": edition,
        "checksum_sha256": checksum,
        "localities": len(localities),
        "streets": len(data["streets"]),
        "settlements": len(data["settlements"]),
        "source": "INEGI",
    }


def _name_matches(query: str, candidates: list[Any], *, threshold: float, limit: int) -> list[tuple[Any, float]]:
    if not query:
        return []
    scored = []
    for item in candidates:
        candidate = item.normalized_name
        score = 1.0 if query == candidate else SequenceMatcher(None, query, candidate).ratio()
        if score >= threshold:
            scored.append((item, score))
    return sorted(scored, key=lambda row: (-row[1], row[0].name.casefold(), row[0].id))[:limit]


def resolve_geo_address(*, business, street: str, colony: str, city: str | None = None) -> dict[str, Any]:
    version = business.geo_catalog_version
    if not version or version.entity_code != business.state_code or version.municipality_code != business.municipality_code:
        return {"status": "catalog_not_ready", "coverage": "unknown", "candidates": []}

    locality_rows = GeoLocality.query.filter_by(catalog_version_id=version.id).all()
    locality_query = _normalize_locality_query(city)
    if locality_query:
        locality_matches = _name_matches(locality_query, locality_rows, threshold=0.78, limit=4)
        if not locality_matches:
            return {"status": "locality_not_found", "coverage": "unknown", "candidates": []}
        top = locality_matches[0][1]
        if len(locality_matches) > 1 and top - locality_matches[1][1] < 0.08:
            return {
                "status": "ambiguous_locality",
                "coverage": "unknown",
                "localities": [{"code": row.locality_code, "name": row.name} for row, _ in locality_matches],
                "candidates": [],
            }
        locality_codes = {locality_matches[0][0].locality_code}
    elif business.locality_code:
        locality_codes = {business.locality_code}
    else:
        locality_codes = {row.locality_code for row in locality_rows}

    street_query = normalize_address_name(street)
    colony_query = normalize_address_name(colony)
    roads = GeoStreet.query.filter(
        GeoStreet.catalog_version_id == version.id,
        GeoStreet.locality_code.in_(locality_codes),
    ).all()
    settlements = GeoSettlement.query.filter(
        GeoSettlement.catalog_version_id == version.id,
        GeoSettlement.locality_code.in_(locality_codes),
    ).all()
    road_matches = _name_matches(street_query, roads, threshold=0.76, limit=6)
    settlement_matches = _name_matches(colony_query, settlements, threshold=0.82, limit=6)
    candidates = []
    localities_by_code = {row.locality_code: row.name for row in locality_rows}
    for road, road_score in road_matches:
        for settlement, settlement_score in settlement_matches:
            if road.locality_code != settlement.locality_code:
                continue
            score = round((road_score + settlement_score) / 2, 3)
            candidates.append({
                "street_id": road.id,
                "street_type": road.street_type,
                "street_name": road.name,
                "settlement_id": settlement.id,
                "settlement_key": settlement.source_key,
                "settlement_type": settlement.settlement_type,
                "settlement_name": settlement.name,
                "locality_code": road.locality_code,
                "locality_name": localities_by_code.get(road.locality_code),
                "score": score,
                "match": "exact" if road_score == settlement_score == 1.0 else "fuzzy_candidate",
            })
    candidates.sort(key=lambda item: (-item["score"], item["street_name"].casefold(), item["settlement_name"].casefold()))
    candidates = candidates[:5]
    if not candidates:
        status = "no_match"
    elif (
        len(candidates) == 1
        and candidates[0]["match"] == "exact"
        and road_matches[0][1] == settlement_matches[0][1] == 1.0
    ):
        status = "exact_match"
    else:
        status = "ambiguous"

    for candidate in candidates:
        candidate["coverage"] = delivery_coverage_status(
            business=business,
            settlement_key=candidate["settlement_key"],
            locality_code=candidate["locality_code"],
            catalog_version_id=version.id,
        )
    coverage = candidates[0]["coverage"] if status == "exact_match" else "unknown"
    return {
        "status": status,
        "coverage": coverage,
        "candidates": candidates,
        "catalog_version_id": version.id,
        "catalog_edition": version.edition,
    }
