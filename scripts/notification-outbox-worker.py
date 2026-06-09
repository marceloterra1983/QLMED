#!/usr/bin/env python3
"""Dispatch QLMED notification outbox deliveries with at-most-once semantics."""

from __future__ import annotations

import argparse
import base64
import html
import json
import os
import smtplib
import ssl
import sys
import urllib.error
import urllib.request
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def request_json(url: str, api_key: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        method="POST" if body is not None else "GET",
        headers={
            "x-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def request_bytes(url: str, api_key: str, expected_content_type: str | None = None) -> bytes:
    request = urllib.request.Request(url, headers={"x-api-key": api_key})
    with urllib.request.urlopen(request, timeout=90) as response:
        content_type = response.headers.get_content_type()
        if expected_content_type and content_type != expected_content_type:
            raise RuntimeError(
                f"Unexpected content type from {url}: {content_type}; expected {expected_content_type}"
            )
        return response.read()


def format_brl(value: object) -> str:
    number = float(value or 0)
    return f"R$ {number:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def build_text(invoice: dict) -> str:
    label = "NF-e Recebida" if invoice["type"] == "NFE" else "CT-e Recebido"
    return (
        f"{label}\n\n"
        f"Número: {invoice.get('number') or '-'}\n"
        f"Emitente/Transportadora: {invoice.get('senderName') or '-'}\n"
        f"Valor: {format_brl(invoice.get('totalValue'))}\n"
        f"Chave: {invoice.get('accessKey') or '-'}\n\n"
        "https://app.qlmed.com.br/fiscal/invoices"
    )


def build_html(invoice: dict) -> str:
    return "<pre style=\"font-family:Arial,sans-serif\">" + html.escape(build_text(invoice)) + "</pre>"


def fetch_assets(base_url: str, api_key: str, invoice: dict) -> tuple[bytes, bytes]:
    invoice_id = invoice["id"]
    pdf = request_bytes(
        f"{base_url}/api/invoices/{invoice_id}/pdf?download=true",
        api_key,
        "application/pdf",
    )
    xml = request_bytes(
        f"{base_url}/api/invoices/{invoice_id}/download",
        api_key,
        "application/xml",
    )
    return pdf, xml


def validate_config(config: dict[str, str]) -> None:
    required = {
        "QLMED_API_URL",
        "QLMED_API_KEY",
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USER",
        "SMTP_PASS",
        "EVO_API_URL",
        "EVO_INSTANCE",
        "EVO_API_KEY",
    }
    missing = sorted(key for key in required if not config.get(key))
    if missing:
        raise RuntimeError(f"Missing required configuration: {', '.join(missing)}")


def smoke_smtp(config: dict[str, str]) -> None:
    host = config["SMTP_HOST"]
    port = int(config["SMTP_PORT"])
    context = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=context, timeout=30) as smtp:
            smtp.login(config["SMTP_USER"], config["SMTP_PASS"])
    else:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            smtp.starttls(context=context)
            smtp.login(config["SMTP_USER"], config["SMTP_PASS"])


def smoke_evolution(config: dict[str, str]) -> None:
    request = urllib.request.Request(
        f"{config['EVO_API_URL'].rstrip('/')}/instance/fetchInstances",
        headers={"apikey": config["EVO_API_KEY"], "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"Evolution smoke returned HTTP {response.status}")
        json.loads(response.read().decode("utf-8", errors="replace") or "[]")


def send_email(config: dict[str, str], delivery: dict, invoice: dict, pdf: bytes, xml: bytes) -> str:
    message = EmailMessage()
    label = "NF-e Recebida" if invoice["type"] == "NFE" else "CT-e Recebido"
    message["Subject"] = f"{label}: Nº {invoice.get('number') or '-'} — {invoice.get('senderName') or '-'}"
    message["From"] = formataddr(("QLMED", config["SMTP_USER"]))
    message["To"] = delivery["recipient"]
    message["Message-ID"] = f"<{delivery['idempotencyKey']}@notifications.qlmed.com.br>"
    message.set_content(build_text(invoice))
    message.add_alternative(build_html(invoice), subtype="html")
    message.add_attachment(pdf, maintype="application", subtype="pdf", filename=f"{invoice['type']}_{invoice['number']}.pdf")
    message.add_attachment(xml, maintype="application", subtype="xml", filename=f"{invoice['accessKey']}.xml")

    host = config["SMTP_HOST"]
    port = int(config["SMTP_PORT"])
    context = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=context, timeout=60) as smtp:
            smtp.login(config["SMTP_USER"], config["SMTP_PASS"])
            smtp.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=60) as smtp:
            smtp.starttls(context=context)
            smtp.login(config["SMTP_USER"], config["SMTP_PASS"])
            smtp.send_message(message)
    return message["Message-ID"]


def send_whatsapp(config: dict[str, str], delivery: dict, invoice: dict, pdf: bytes) -> str | None:
    body = {
        "number": delivery["recipient"],
        "mediatype": "document",
        "media": base64.b64encode(pdf).decode("ascii"),
        "mimetype": "application/pdf",
        "fileName": f"{invoice['type']}_{invoice['number']}.pdf",
        "caption": build_text(invoice),
    }
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"{config['EVO_API_URL']}/message/sendMedia/{config['EVO_INSTANCE']}",
        data=data,
        method="POST",
        headers={"apikey": config["EVO_API_KEY"], "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        payload = json.loads(response.read().decode("utf-8", errors="replace") or "{}")
        return str(payload.get("key", {}).get("id") or payload.get("messageId") or "") or None


def ack(base_url: str, api_key: str, delivery: dict, outcome: str, **extra: str | None) -> None:
    item = {
        "id": delivery["id"],
        "lockToken": delivery["lockToken"],
        "outcome": outcome,
        **{key: value for key, value in extra.items() if value},
    }
    response = request_json(f"{base_url}/api/notifications/outbox/ack", api_key, {"deliveries": [item]})
    if response.get("accepted") != 1 or response.get("rejected") != 0:
        raise RuntimeError(f"Delivery acknowledgement rejected: {delivery['id']}")


def mark_submitting(base_url: str, api_key: str, delivery: dict) -> None:
    response = request_json(
        f"{base_url}/api/notifications/outbox/submitting",
        api_key,
        {"id": delivery["id"], "lockToken": delivery["lockToken"]},
    )
    if response.get("accepted") is not True:
        raise RuntimeError(f"Provider submission phase rejected: {delivery['id']}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--invoice-type", required=True, choices=["NFE", "CTE"])
    parser.add_argument("--env", default=os.environ.get("QLMED_NOTIFY_ENV"))
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--smoke", action="store_true")
    args = parser.parse_args()

    if not args.env:
        raise SystemExit("--env or QLMED_NOTIFY_ENV is required")
    config = {**load_env(Path(args.env)), **os.environ}
    validate_config(config)
    base_url = config["QLMED_API_URL"].rstrip("/")
    api_key = config["QLMED_API_KEY"]

    if args.smoke:
        smoke = request_json(
            f"{base_url}/api/notifications/outbox/smoke?invoiceType={args.invoice_type}",
            api_key,
        )
        if smoke.get("ok") is not True:
            raise RuntimeError("Notification outbox smoke endpoint rejected the worker")
        invoice_id = smoke.get("invoiceId")
        if invoice_id:
            fetch_assets(base_url, api_key, {"id": invoice_id})
        smoke_smtp(config)
        smoke_evolution(config)
        return 0

    claim = request_json(
        f"{base_url}/api/notifications/outbox/claim",
        api_key,
        {
            "workerId": f"python-outbox-{args.invoice_type.lower()}",
            "invoiceType": args.invoice_type,
            "limit": max(1, min(args.limit, 100)),
        },
    )

    for delivery in claim.get("deliveries", []):
        invoice = delivery["event"]["invoice"]
        try:
            pdf, xml = fetch_assets(base_url, api_key, invoice)
        except Exception as error:
            ack(base_url, api_key, delivery, "retry", error=f"Asset fetch failed before send: {error!r}")
            continue

        try:
            mark_submitting(base_url, api_key, delivery)
        except Exception as error:
            ack(base_url, api_key, delivery, "retry", error=f"Could not enter provider submission phase: {error!r}")
            continue

        try:
            if delivery["channel"] == "email":
                provider_id = send_email(config, delivery, invoice, pdf, xml)
            else:
                provider_id = send_whatsapp(config, delivery, invoice, pdf)
            ack(base_url, api_key, delivery, "sent", providerMessageId=provider_id)
        except urllib.error.HTTPError as error:
            # Once submission began, every non-definitive result is ambiguous.
            # Do not retry automatically because duplicate prevention wins.
            outcome = "dead" if error.code in {400, 401, 403, 404, 405, 410, 413, 415, 422} else "uncertain"
            ack(base_url, api_key, delivery, outcome, error=f"Provider HTTP {error.code}")
        except Exception as error:
            ack(base_url, api_key, delivery, "uncertain", error=f"Provider outcome unknown: {error!r}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
