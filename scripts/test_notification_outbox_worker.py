#!/usr/bin/env python3
"""Worker caption rules for SPEC-017."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "notification_outbox_worker",
    Path(__file__).resolve().parent / "notification-outbox-worker.py",
)
assert SPEC and SPEC.loader
WORKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKER)

ACCESS_KEY = "50260809296295001727570030001334971511477148"
LINK = "https://app.qlmed.com.br/r/cmtc0yjyj00fz08nu4u4c4uzf"


class WorkerCaptionTests(unittest.TestCase):
    def test_cte_whatsapp_uses_caption_and_omits_key(self) -> None:
        invoice = {
            "type": "CTE",
            "number": "133497",
            "senderName": "AZUL LINHAS AEREAS BRASILEIRAS SA",
            "totalValue": 325.63,
            "accessKey": ACCESS_KEY,
            "whatsappCaption": (
                "CT-e Recebido\n\nAZUL\nC.G. ➡️ São Paulo\nR$ 325,63"
            ),
        }
        text = WORKER.build_whatsapp_text(invoice, LINK)
        self.assertIn("AZUL", text)
        self.assertIn("C.G. ➡️ São Paulo", text)
        self.assertNotIn("🚛", text)
        self.assertNotIn("Nº", text)
        self.assertNotIn("133497", text)
        self.assertIn(LINK, text)
        self.assertNotIn("Chave", text)
        self.assertNotIn(ACCESS_KEY, text)

    def test_cte_email_keeps_full_text_with_key(self) -> None:
        invoice = {
            "type": "CTE",
            "number": "133497",
            "senderName": "AZUL LINHAS AEREAS BRASILEIRAS SA",
            "totalValue": 325.63,
            "accessKey": ACCESS_KEY,
            "whatsappCaption": "CT-e Recebido\n\nNº 133497 · AZUL",
        }
        text = WORKER.build_text(invoice, LINK)
        self.assertIn("Chave:", text)
        self.assertIn(ACCESS_KEY, text)
        self.assertIn("AZUL LINHAS AEREAS BRASILEIRAS SA", text)

    def test_nfe_whatsapp_stays_on_full_text(self) -> None:
        invoice = {
            "type": "NFE",
            "number": "1",
            "senderName": "Fornecedor",
            "totalValue": 10,
            "accessKey": ACCESS_KEY,
        }
        text = WORKER.build_whatsapp_text(invoice, LINK)
        self.assertIn("NF-e Recebida", text)
        self.assertIn("Chave:", text)
        self.assertIn(ACCESS_KEY, text)


if __name__ == "__main__":
    unittest.main()
