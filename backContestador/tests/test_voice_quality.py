import unittest
from types import SimpleNamespace

from app.api.calls import _redact_call_for_role, _viewer_phone_search_suffix
from app.services.address_catalog import delivery_coverage_status, normalize_address_name
from app.services.voice_realtime import _join_transcript_pieces
from app.services.voice_tools import MenuResolver, OrderTools
from app.services.orders import OrderValidationError


class TranscriptAssemblyTests(unittest.TestCase):
    def test_repeated_final_segments_are_preserved(self):
        self.assertEqual(_join_transcript_pieces(["Sí", "sí"]), "Sí sí")

    def test_punctuation_does_not_gain_a_space(self):
        self.assertEqual(_join_transcript_pieces(["¿Qué tal", "?"]), "¿Qué tal?")


class CallPrivacyTests(unittest.TestCase):
    def test_viewer_payload_hides_conversation_and_masks_phone(self):
        payload = {
            "phone_number": "+52 686 123 4567",
            "transcript": "Quiero enviar el pedido a avenida...",
            "ai_summary": "Cliente pidió comida en ...",
            "draft_cart": {"version": 1, "revision": 4, "items": [{"name": "Taco"}]},
            "tool_calls": [{"tool_name": "resolve_delivery_address"}],
        }
        redacted = _redact_call_for_role(payload, "viewer")
        self.assertEqual(redacted["phone_number"], "••••4567")
        self.assertIsNone(redacted["transcript"])
        self.assertIsNone(redacted["ai_summary"])
        self.assertEqual(redacted["draft_cart"]["items"], [])
        self.assertEqual(redacted["tool_calls"], [])

    def test_viewer_phone_search_is_limited_to_last_four_digits(self):
        self.assertEqual(_viewer_phone_search_suffix("+52 686 123 4567"), "4567")
        self.assertIsNone(_viewer_phone_search_suffix("456"))


class AddressNormalizationTests(unittest.TestCase):
    def test_road_type_and_accents_normalize_for_candidate_search(self):
        self.assertEqual(normalize_address_name("Avenida Reforma"), "reforma")
        self.assertEqual(normalize_address_name("Reformá"), "reforma")

    def test_coverage_requires_the_business_locality(self):
        business = SimpleNamespace(
            locality_code="0001",
            geo_catalog_version_id=7,
            delivery_zones=[SimpleNamespace(is_active=True, settlement_keys=["settlement-1"])],
        )
        self.assertEqual(
            delivery_coverage_status(
                business=business,
                settlement_key="settlement-1",
                locality_code="0001",
                catalog_version_id=7,
            ),
            "in_coverage",
        )
        self.assertEqual(
            delivery_coverage_status(
                business=business,
                settlement_key="settlement-1",
                locality_code="0002",
                catalog_version_id=7,
            ),
            "out_of_coverage",
        )
        self.assertEqual(
            delivery_coverage_status(
                business=business,
                settlement_key="settlement-1",
                locality_code="0001",
                catalog_version_id=8,
            ),
            "unknown",
        )
        self.assertEqual(
            delivery_coverage_status(
                business=business,
                settlement_key="same-name-but-different-key",
                locality_code="0001",
                catalog_version_id=7,
            ),
            "out_of_coverage",
        )


class MenuResolverTests(unittest.TestCase):
    @staticmethod
    def product(product_id, name, aliases=()):
        return SimpleNamespace(
            id=product_id,
            name=name,
            aliases=list(aliases),
            category=None,
        )

    def test_alias_resolves_without_adding_to_cart(self):
        product = self.product(1, "Hamburguesa de la Casa", ["la de la casa"])
        result = MenuResolver.resolve("la de la casa", [product])
        self.assertEqual(result["status"], "exact_match")
        self.assertEqual(result["candidates"][0]["id"], 1)

    def test_shared_generic_name_stays_ambiguous(self):
        products = [
            self.product(1, "Tacos al pastor rojo"),
            self.product(2, "Tacos al pastor verde"),
        ]
        result = MenuResolver.resolve("tacos al pastor", products)
        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(len(result["candidates"]), 2)


class RequiredModifierTests(unittest.TestCase):
    def setUp(self):
        self.tool = OrderTools.__new__(OrderTools)
        self.product = SimpleNamespace(
            name="Combo",
            modifiers=[SimpleNamespace(
                id=5,
                name="Grande",
                price="10.00",
                group_name="Tamaño",
                action="choice",
                is_active=True,
                is_required=True,
                sort_order=1,
            )],
        )

    def test_required_choice_must_be_selected(self):
        with self.assertRaises(OrderValidationError):
            self.tool._validated_modifiers(self.product, [])

    def test_valid_required_choice_is_returned(self):
        ids, modifiers, total = self.tool._validated_modifiers(self.product, [5])
        self.assertEqual(ids, [5])
        self.assertEqual(modifiers[0]["group"], "Tamaño")
        self.assertEqual(total, 10)


if __name__ == "__main__":
    unittest.main()
